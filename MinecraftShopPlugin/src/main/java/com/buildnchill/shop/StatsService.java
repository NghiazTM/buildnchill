package com.buildnchill.shop;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.OfflinePlayer;
import org.bukkit.Statistic;
import org.bukkit.advancement.Advancement;
import org.bukkit.advancement.AdvancementDisplay;
import org.bukkit.advancement.AdvancementProgress;
import org.bukkit.entity.Player;

import java.io.File;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Logger;

/**
 * Đọc thống kê & thành tựu Minecraft của người chơi để gửi lên website.
 * - Người đang online: đọc trực tiếp qua Bukkit API (main thread).
 * - Nhập lịch sử lần đầu: đọc file world/stats/*.json và world/advancements/*.json (thread async).
 */
public class StatsService {

    /** Tên trong Bukkit API  ->  khóa trong file stats (minecraft:custom) */
    private static final String[][] COUNTERS = {
            {"deaths", "DEATHS", "deaths"},
            {"mob_kills", "MOB_KILLS", "mob_kills"},
            {"player_kills", "PLAYER_KILLS", "player_kills"},
            {"fish_caught", "FISH_CAUGHT", "fish_caught"},
            {"animals_bred", "ANIMALS_BRED", "animals_bred"},
            {"traded", "TRADED_WITH_VILLAGER", "traded_with_villager"},
            {"jumps", "JUMP", "jump"},
    };
    private static final String[] DISTANCE = {
            "WALK_ONE_CM", "SPRINT_ONE_CM", "CROUCH_ONE_CM", "SWIM_ONE_CM", "WALK_UNDER_WATER_ONE_CM",
            "WALK_ON_WATER_ONE_CM", "CLIMB_ONE_CM", "FLY_ONE_CM", "AVIATE_ONE_CM", "BOAT_ONE_CM",
            "HORSE_ONE_CM", "MINECART_ONE_CM", "PIG_ONE_CM", "STRIDER_ONE_CM",
    };

    private final Logger log;
    /** khóa thành tựu -> {tiêu đề, loại} — chỉ các thành tựu hiển thị (bỏ công thức chế tạo). */
    private volatile Map<String, String[]> advMeta = Collections.emptyMap();
    private volatile Map<String, Advancement> advObjects = Collections.emptyMap();
    private volatile List<Material> minableBlocks;

    /** Số liệu từ plugin khác qua PlaceholderAPI: key -> {label, placeholder} */
    private volatile Map<String, String[]> placeholders = Collections.emptyMap();
    private java.lang.reflect.Method papiMethod;
    private boolean papiChecked;

    public StatsService(Logger log) {
        this.log = log;
    }

    public void setPlaceholders(Map<String, String[]> map) {
        placeholders = map == null ? Collections.emptyMap() : map;
        papiChecked = false;
    }

    /** PlaceholderAPI.setPlaceholders(OfflinePlayer, String) — gọi bằng reflection, không bắt buộc cài PAPI. */
    private String papi(Player p, String text) {
        if (!papiChecked) {
            papiChecked = true;
            papiMethod = null;
            if (Bukkit.getPluginManager().isPluginEnabled("PlaceholderAPI")) {
                try {
                    papiMethod = Class.forName("me.clip.placeholderapi.PlaceholderAPI")
                            .getMethod("setPlaceholders", OfflinePlayer.class, String.class);
                } catch (Throwable t) {
                    log.warning("Không dùng được PlaceholderAPI: " + t.getMessage());
                }
            }
        }
        if (papiMethod == null) return null;
        try {
            Object out = papiMethod.invoke(null, p, text);
            return out == null ? null : out.toString();
        } catch (Throwable t) {
            return null;
        }
    }

    private JsonObject collectExtras(Player p) {
        JsonObject extra = new JsonObject();
        for (Map.Entry<String, String[]> e : placeholders.entrySet()) {
            String raw = papi(p, e.getValue()[1]);
            if (raw == null) continue;
            String value = org.bukkit.ChatColor.stripColor(raw.replaceAll("(?i)[&§][0-9a-fk-orx]", "")).trim();
            // Chưa cài expansion -> PAPI trả nguyên văn %...% => bỏ qua
            if (value.isEmpty() || value.equals(e.getValue()[1]) || value.matches(".*%[A-Za-z0-9_]+%.*")) continue;
            JsonObject v = new JsonObject();
            v.addProperty("label", e.getValue()[0]);
            v.addProperty("value", value.length() > 40 ? value.substring(0, 40) : value);
            extra.add(e.getKey(), v);
        }
        return extra;
    }

    // ==================== Thành tựu (main thread) ====================

    public void loadAdvancementMeta() {
        Map<String, String[]> meta = new LinkedHashMap<>();
        Map<String, Advancement> objs = new HashMap<>();
        Iterator<Advancement> it = Bukkit.advancementIterator();
        while (it.hasNext()) {
            Advancement adv = it.next();
            String key = adv.getKey().toString();
            if (key.contains(":recipes/")) continue;
            try {
                AdvancementDisplay d = adv.getDisplay();
                if (d == null) continue;
                String title = d.getTitle();
                String frame = d.getType() == null ? "task" : d.getType().name().toLowerCase(Locale.ROOT);
                meta.put(key, new String[]{title == null || title.isBlank() ? key : title, frame});
                objs.put(key, adv);
            } catch (Throwable t) {
                // API cũ không có getDisplay(): vẫn đếm, dùng khóa làm tên
                meta.put(key, new String[]{key, "task"});
                objs.put(key, adv);
            }
        }
        advMeta = meta;
        advObjects = objs;
    }

    public int advancementTotal() {
        return advMeta.size();
    }

    // ==================== Người đang online (main thread) ====================

    private static long stat(Player p, String name) {
        try {
            return Math.max(0, p.getStatistic(Statistic.valueOf(name)));
        } catch (Throwable t) {
            return 0;
        }
    }

    private long blocksMined(Player p) {
        List<Material> list = minableBlocks;
        if (list == null) {
            list = new ArrayList<>();
            for (Material m : Material.values()) {
                try {
                    if (m.isLegacy() || !m.isBlock()) continue;
                    p.getStatistic(Statistic.MINE_BLOCK, m);
                    list.add(m);
                } catch (Throwable ignored) {
                    // khối không có thống kê
                }
            }
            minableBlocks = list;
        }
        long sum = 0;
        for (Material m : list) {
            try {
                sum += p.getStatistic(Statistic.MINE_BLOCK, m);
            } catch (Throwable ignored) {
                // bỏ qua
            }
        }
        return sum;
    }

    /** Gọi trên main thread. includeAdvancements: gửi kèm danh sách thành tựu đã đạt. */
    public JsonObject collect(Player p, boolean includeAdvancements) {
        JsonObject o = new JsonObject();
        o.addProperty("uuid", p.getUniqueId().toString());
        o.addProperty("name", p.getName());
        o.addProperty("play_seconds", stat(p, "PLAY_ONE_MINUTE") / 20L);
        for (String[] c : COUNTERS) o.addProperty(c[0], stat(p, c[1]));
        long dist = 0;
        for (String d : DISTANCE) dist += stat(p, d);
        o.addProperty("distance_cm", dist);
        o.addProperty("blocks_mined", blocksMined(p));
        o.addProperty("level", p.getLevel());
        JsonObject extra = collectExtras(p);
        if (extra.size() > 0) o.add("extra", extra);

        int done = 0;
        JsonArray list = includeAdvancements ? new JsonArray() : null;
        for (Map.Entry<String, String[]> e : advMeta.entrySet()) {
            try {
                Advancement adv = advObjects.get(e.getKey());
                if (adv == null) continue;
                AdvancementProgress prog = p.getAdvancementProgress(adv);
                if (!prog.isDone()) continue;
                done++;
                if (list != null) {
                    long at = 0;
                    for (String crit : prog.getAwardedCriteria()) {
                        Date d = prog.getDateAwarded(crit);
                        if (d != null) at = Math.max(at, d.getTime());
                    }
                    list.add(advJson(e.getKey(), e.getValue(), at));
                }
            } catch (Throwable ignored) {
                // bỏ qua thành tựu lỗi
            }
        }
        o.addProperty("adv_done", done);
        o.addProperty("adv_total", advMeta.size());
        if (list != null) o.add("advancements", list);
        return o;
    }

    private static JsonObject advJson(String key, String[] meta, long at) {
        JsonObject a = new JsonObject();
        a.addProperty("key", key);
        a.addProperty("title", meta[0]);
        a.addProperty("frame", meta[1]);
        if (at > 0) a.addProperty("at", at);
        return a;
    }

    // ==================== Nhập lịch sử từ file (async) ====================

    /**
     * @param worldFolder thư mục world chính
     * @param names       uuid -> tên (lấy trên main thread từ Bukkit.getOfflinePlayers())
     */
    public List<JsonObject> collectFromFiles(File worldFolder, Map<UUID, String> names) {
        List<JsonObject> out = new ArrayList<>();
        File statsDir = new File(worldFolder, "stats");
        File advDir = new File(worldFolder, "advancements");
        File[] files = statsDir.listFiles((dir, n) -> n.endsWith(".json"));
        if (files == null) return out;

        for (File f : files) {
            UUID uuid;
            try {
                uuid = UUID.fromString(f.getName().substring(0, f.getName().length() - 5));
            } catch (IllegalArgumentException e) {
                continue;
            }
            String name = names.get(uuid);
            if (name == null || name.isBlank()) continue;
            try {
                JsonObject stats = readJson(f).getAsJsonObject().getAsJsonObject("stats");
                if (stats == null) continue;
                JsonObject custom = obj(stats, "minecraft:custom");
                JsonObject o = new JsonObject();
                o.addProperty("uuid", uuid.toString());
                o.addProperty("name", name);
                long playTicks = num(custom, "minecraft:play_time");
                if (playTicks == 0) playTicks = num(custom, "minecraft:play_one_minute");
                o.addProperty("play_seconds", playTicks / 20L);
                for (String[] c : COUNTERS) o.addProperty(c[0], num(custom, "minecraft:" + c[2]));
                long dist = 0;
                for (String d : DISTANCE) dist += num(custom, "minecraft:" + d.toLowerCase(Locale.ROOT));
                o.addProperty("distance_cm", dist);
                long mined = 0;
                JsonObject minedObj = obj(stats, "minecraft:mined");
                if (minedObj != null) {
                    for (Map.Entry<String, JsonElement> e : minedObj.entrySet()) mined += safeLong(e.getValue());
                }
                o.addProperty("blocks_mined", mined);

                File af = new File(advDir, f.getName());
                if (af.isFile() && !advMeta.isEmpty()) {
                    JsonArray list = new JsonArray();
                    JsonObject advs = readJson(af).getAsJsonObject();
                    for (Map.Entry<String, JsonElement> e : advs.entrySet()) {
                        String[] meta = advMeta.get(e.getKey());
                        if (meta == null || !e.getValue().isJsonObject()) continue;
                        JsonObject a = e.getValue().getAsJsonObject();
                        if (!a.has("done") || !a.get("done").getAsBoolean()) continue;
                        list.add(advJson(e.getKey(), meta, latestCriteria(a)));
                    }
                    o.addProperty("adv_done", list.size());
                    o.addProperty("adv_total", advMeta.size());
                    o.add("advancements", list);
                }
                out.add(o);
            } catch (Exception e) {
                log.fine("Bỏ qua file thống kê " + f.getName() + ": " + e.getMessage());
            }
        }
        return out;
    }

    private static long latestCriteria(JsonObject adv) {
        JsonObject crit = obj(adv, "criteria");
        if (crit == null) return 0;
        long best = 0;
        java.text.SimpleDateFormat fmt = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss Z", Locale.ROOT);
        for (Map.Entry<String, JsonElement> e : crit.entrySet()) {
            try {
                Date d = fmt.parse(e.getValue().getAsString());
                best = Math.max(best, d.getTime());
            } catch (Exception ignored) {
                // định dạng lạ
            }
        }
        return best;
    }

    private static JsonElement readJson(File f) throws Exception {
        try (Reader r = Files.newBufferedReader(f.toPath(), StandardCharsets.UTF_8)) {
            return JsonParser.parseReader(r);
        }
    }

    private static JsonObject obj(JsonObject parent, String key) {
        if (parent == null || !parent.has(key) || !parent.get(key).isJsonObject()) return null;
        return parent.getAsJsonObject(key);
    }

    private static long num(JsonObject o, String key) {
        if (o == null || !o.has(key)) return 0;
        return safeLong(o.get(key));
    }

    private static long safeLong(JsonElement e) {
        try {
            return Math.max(0, e.getAsLong());
        } catch (Exception ex) {
            return 0;
        }
    }

    /** uuid -> tên của mọi người chơi đã từng vào server (main thread). */
    public static Map<UUID, String> knownNames() {
        Map<UUID, String> map = new HashMap<>();
        for (OfflinePlayer op : Bukkit.getOfflinePlayers()) {
            String n = op.getName();
            if (n != null) map.put(op.getUniqueId(), n);
        }
        return map;
    }
}
