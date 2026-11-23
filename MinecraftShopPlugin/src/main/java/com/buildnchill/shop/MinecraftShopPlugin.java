package com.buildnchill.shop;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.Sound;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerAdvancementDoneEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.io.File;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * BuildnChill Shop v2 — nhận đơn hàng từ website qua Netlify plugin bridge
 * và giao vật phẩm trong game khi người chơi online.
 */
public class MinecraftShopPlugin extends JavaPlugin implements Listener, TabCompleter {

    private static final String DEFAULT_URL = "https://buildnchill.id.vn/api/plugin-bridge";
    private static final int EXECUTED_CACHE_SIZE = 2000;

    private BridgeClient client;
    private BukkitTask pollTask;
    private BukkitTask statsTask;
    private StatsService stats;
    /** Người chơi cần gửi lại danh sách thành tựu (mới vào / vừa đạt thành tựu). */
    private final Set<UUID> needAdvancements = ConcurrentHashMap.newKeySet();
    private final AtomicBoolean backfilling = new AtomicBoolean(false);
    private volatile String lastStatsError = null;
    private final AtomicBoolean polling = new AtomicBoolean(false);

    /** Kết quả chưa gửi được cho bridge — gửi lại ở chu kỳ sau. */
    private final Map<String, BridgeClient.Result> pendingResults = Collections.synchronizedMap(new LinkedHashMap<>());

    /** Các đơn đã thực thi (LRU) — nếu bridge gửi lại thì chỉ ack, không chạy lệnh lần 2. */
    private final Map<String, BridgeClient.Result> executed = Collections.synchronizedMap(
            new LinkedHashMap<String, BridgeClient.Result>(256, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, BridgeClient.Result> eldest) {
                    return size() > EXECUTED_CACHE_SIZE;
                }
            });

    // Thống kê
    private final AtomicLong deliveredCount = new AtomicLong();
    private final AtomicLong failedCount = new AtomicLong();
    private volatile long lastPollAt = 0L;
    private volatile long lastSuccessAt = 0L;
    private volatile String lastError = null;
    private volatile String lastLoggedError = null;

    // ==================== Lifecycle ====================

    @Override
    public void onEnable() {
        saveDefaultConfig();
        stats = new StatsService(getLogger());
        Bukkit.getPluginManager().registerEvents(this, this);
        if (getCommand("bncshop") != null) {
            getCommand("bncshop").setTabCompleter(this);
        }
        loadAndStart();
        getLogger().info("BuildnChill Shop v" + getDescription().getVersion() + " đã sẵn sàng!");
    }

    @Override
    public void onDisable() {
        stopTask();
        if (!pendingResults.isEmpty()) {
            getLogger().warning("Còn " + pendingResults.size() + " kết quả giao hàng chưa gửi được lên website.");
        }
        getLogger().info("BuildnChill Shop đã tắt.");
    }

    private void loadAndStart() {
        stopTask();
        reloadConfig();
        FileConfiguration cfg = getConfig();

        String url = cfg.getString("bridge.url", DEFAULT_URL);
        String secret = cfg.getString("bridge.secret", "");
        client = new BridgeClient(url, secret);
        lastLoggedError = null;

        if (secret == null || secret.isBlank() || secret.startsWith("DOI_")) {
            client = null;
            lastError = "Chưa cấu hình bridge.secret";
            getLogger().warning("Chưa cấu hình bridge.secret trong config.yml — plugin sẽ KHÔNG giao hàng.");
            getLogger().warning("Đặt bridge.secret trùng với biến PLUGIN_SECRET trên Netlify rồi dùng /bncshop reload.");
            return;
        }

        int interval = Math.max(3, cfg.getInt("poll.interval_seconds", 10));
        pollTask = Bukkit.getScheduler().runTaskTimerAsynchronously(this, this::pollCycle, 40L, interval * 20L);
        getLogger().info("Đang kết nối bridge: " + url + " (mỗi " + interval + " giây)");

        // Thống kê & thành tựu trong game -> website
        if (cfg.getBoolean("stats.enabled", true)) {
            Map<String, String[]> ph = new LinkedHashMap<>();
            org.bukkit.configuration.ConfigurationSection sec = cfg.getConfigurationSection("stats.placeholders");
            if (sec != null) {
                for (String key : sec.getKeys(false)) {
                    String value = sec.getString(key + ".value", "");
                    if (!key.matches("[a-z0-9_]{1,24}") || value == null || value.isBlank()) continue;
                    ph.put(key, new String[]{sec.getString(key + ".label", key), value});
                }
            }
            stats.setPlaceholders(ph);
            int statsInterval = Math.max(30, cfg.getInt("stats.interval_seconds", 60));
            Bukkit.getScheduler().runTaskLater(this, () -> {
                stats.loadAdvancementMeta();
                for (Player p : Bukkit.getOnlinePlayers()) needAdvancements.add(p.getUniqueId());
                if (cfg.getBoolean("stats.backfill_on_start", true) && !backfillMarker().exists()) {
                    getLogger().info("Lần đầu chạy: đang nhập thống kê cũ của toàn bộ người chơi lên website...");
                    startBackfill(null);
                }
            }, 100L);
            statsTask = Bukkit.getScheduler().runTaskTimer(this, this::statsCycle, 200L, statsInterval * 20L);
        }
    }

    private void stopTask() {
        if (pollTask != null) {
            pollTask.cancel();
            pollTask = null;
        }
        if (statsTask != null) {
            statsTask.cancel();
            statsTask = null;
        }
    }

    // ==================== Thống kê người chơi ====================

    private File backfillMarker() {
        return new File(getDataFolder(), "stats-backfill.done");
    }

    /** Main thread: đọc thống kê người đang online rồi gửi async. */
    private void statsCycle() {
        if (client == null || stats.advancementTotal() == 0) return;
        JsonArray rows = new JsonArray();
        List<UUID> withAdv = new ArrayList<>();
        for (Player p : Bukkit.getOnlinePlayers()) {
            boolean adv = needAdvancements.remove(p.getUniqueId());
            if (adv) withAdv.add(p.getUniqueId());
            try {
                rows.add(stats.collect(p, adv));
            } catch (Exception e) {
                getLogger().fine("Không đọc được thống kê " + p.getName() + ": " + e.getMessage());
            }
        }
        sendStatsAsync(rows, false, withAdv);
    }

    private void sendStatsAsync(JsonArray rows, boolean backfill, List<UUID> retryAdvOnFail) {
        BridgeClient bridge = client;
        if (bridge == null || rows.size() == 0) return;
        Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
            try {
                bridge.sendStats(rows, backfill);
                if (lastStatsError != null) getLogger().info("Đã gửi lại thống kê lên website thành công.");
                lastStatsError = null;
            } catch (BridgeClient.BridgeException e) {
                if (retryAdvOnFail != null) needAdvancements.addAll(retryAdvOnFail);
                if (!e.getMessage().equals(lastStatsError)) getLogger().warning("[Thống kê] " + e.getMessage());
                lastStatsError = e.getMessage();
            }
        });
    }

    /** Nhập thống kê cũ từ file của mọi người chơi (sender = null khi tự chạy lần đầu). */
    private void startBackfill(CommandSender sender) {
        if (client == null) return;
        if (!backfilling.compareAndSet(false, true)) {
            if (sender != null) sender.sendMessage(color(prefix() + "&eĐang nhập thống kê, vui lòng chờ..."));
            return;
        }
        if (stats.advancementTotal() == 0) stats.loadAdvancementMeta();
        Map<UUID, String> names = StatsService.knownNames();
        File world = Bukkit.getWorlds().get(0).getWorldFolder();
        BridgeClient bridge = client;
        Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
            int sent = 0;
            String error = null;
            try {
                List<JsonObject> rows = stats.collectFromFiles(world, names);
                for (int i = 0; i < rows.size(); i += 40) {
                    JsonArray chunk = new JsonArray();
                    for (JsonObject o : rows.subList(i, Math.min(rows.size(), i + 40))) chunk.add(o);
                    bridge.sendStats(chunk, true);
                    sent += chunk.size();
                }
                try {
                    getDataFolder().mkdirs();
                    java.nio.file.Files.writeString(backfillMarker().toPath(), new Date() + " - " + sent + " người chơi\n");
                } catch (Exception ignored) {
                    // không ghi được dấu -> lần sau chạy lại, không sao
                }
            } catch (Exception e) {
                error = e.getMessage();
            } finally {
                backfilling.set(false);
            }
            String msg = error == null
                    ? "&aĐã nhập thống kê của &f" + sent + " &angười chơi lên website."
                    : "&cNhập thống kê lỗi sau " + sent + " người: " + error;
            getLogger().info(ChatColor.stripColor(color(msg)));
            if (sender != null) Bukkit.getScheduler().runTask(this, () -> sender.sendMessage(color(prefix() + msg)));
        });
    }

    // ==================== Poll cycle (async) ====================

    private void requestPoll(long delayTicks) {
        if (client == null || !isEnabled()) return;
        Bukkit.getScheduler().runTaskLaterAsynchronously(this, this::pollCycle, Math.max(1L, delayTicks));
    }

    /** SuperVanish / PremiumVanish / EssentialsX / VanishNoPacket đều gắn metadata "vanished". */
    private static boolean isVanished(Player p) {
        try {
            for (org.bukkit.metadata.MetadataValue v : p.getMetadata("vanished")) {
                if (v.asBoolean()) return true;
            }
        } catch (Exception ignored) {
            // plugin vanish lạ -> coi như không vanish
        }
        return false;
    }

    private void pollCycle() {
        if (client == null || !polling.compareAndSet(false, true)) return;
        BridgeClient bridge = client;
        try {
            lastPollAt = System.currentTimeMillis();

            // 1. Snapshot người chơi online trên main thread
            List<String> hidden = new ArrayList<>();
            List<String> online = Bukkit.getScheduler().callSyncMethod(this, () -> {
                List<String> names = new ArrayList<>();
                for (Player p : Bukkit.getOnlinePlayers()) {
                    names.add(p.getName());
                    if (isVanished(p)) hidden.add(p.getName());
                }
                return names;
            }).get(10, TimeUnit.SECONDS);

            List<BridgeClient.Result> results = new ArrayList<>();

            // 2. Nhịp tim + lấy đơn cần giao (luôn gọi, kể cả khi không ai online, để web biết máy chủ đang chạy)
            String mcVersion = Bukkit.getBukkitVersion().split("-")[0];
            List<BridgeClient.Delivery> deliveries = bridge.fetch(online, hidden, Bukkit.getMaxPlayers(), mcVersion);
            if (!online.isEmpty()) {
                List<BridgeClient.Delivery> toRun = new ArrayList<>();

                for (BridgeClient.Delivery d : deliveries) {
                    BridgeClient.Result prev = executed.get(d.id);
                    if (prev != null) {
                        results.add(prev); // Đã chạy trước đó — chỉ ack lại
                    } else if (!pendingResults.containsKey(d.id)) {
                        toRun.add(d);
                    }
                }

                // 3. Chạy lệnh trên main thread
                if (!toRun.isEmpty()) {
                    List<BridgeClient.Result> ran = Bukkit.getScheduler()
                            .callSyncMethod(this, () -> executeDeliveries(toRun))
                            .get(30, TimeUnit.SECONDS);
                    results.addAll(ran);
                }
            }

            // 4. Gộp với kết quả tồn đọng và gửi lên bridge
            for (BridgeClient.Result r : results) pendingResults.put(r.id, r);
            if (!pendingResults.isEmpty()) {
                List<BridgeClient.Result> batch;
                synchronized (pendingResults) {
                    batch = new ArrayList<>(pendingResults.values());
                }
                bridge.report(batch);
                synchronized (pendingResults) {
                    for (BridgeClient.Result r : batch) pendingResults.remove(r.id);
                }
            }

            onBridgeOk();
        } catch (BridgeClient.BridgeException e) {
            onBridgeError(e.getMessage());
        } catch (Exception e) {
            onBridgeError("Lỗi xử lý: " + e.getClass().getSimpleName()
                    + (e.getMessage() != null ? " - " + e.getMessage() : ""));
        } finally {
            polling.set(false);
        }
    }

    private void onBridgeOk() {
        lastSuccessAt = System.currentTimeMillis();
        if (lastError != null && lastLoggedError != null) {
            getLogger().info("Đã kết nối lại bridge thành công.");
        }
        lastError = null;
        lastLoggedError = null;
    }

    private void onBridgeError(String msg) {
        lastError = msg;
        if (!msg.equals(lastLoggedError)) {
            getLogger().warning("[Bridge] " + msg);
            lastLoggedError = msg;
        }
    }

    // ==================== Thực thi giao hàng (main thread) ====================

    private List<BridgeClient.Result> executeDeliveries(List<BridgeClient.Delivery> deliveries) {
        Map<String, Player> onlineByLower = new HashMap<>();
        for (Player p : Bukkit.getOnlinePlayers()) onlineByLower.put(p.getName().toLowerCase(Locale.ROOT), p);

        List<BridgeClient.Result> results = new ArrayList<>();
        for (BridgeClient.Delivery d : deliveries) {
            Player player = onlineByLower.get(d.mcUsername.toLowerCase(Locale.ROOT));
            if (player == null) continue; // Không online — để server xếp hàng lại

            BridgeClient.Result r = runDelivery(d, player);
            executed.put(d.id, r);
            results.add(r);
        }
        return results;
    }

    private BridgeClient.Result runDelivery(BridgeClient.Delivery d, Player player) {
        String product = d.productName != null ? d.productName : "vật phẩm";
        if (d.commands.isEmpty()) {
            failedCount.incrementAndGet();
            getLogger().warning("❌ Đơn " + d.id + " (" + product + ") không có lệnh nào để chạy.");
            return new BridgeClient.Result(d.id, false, "Đơn không có lệnh nào");
        }

        ConsoleCommandSender console = Bukkit.getConsoleSender();
        String error = null;
        int ran = 0;

        for (String raw : d.commands) {
            String cmd = applyPlaceholders(raw, player);
            if (cmd.isEmpty()) continue;
            try {
                boolean ok = Bukkit.dispatchCommand(console, cmd);
                if (!ok) {
                    error = "Lệnh không thực thi được: " + cmd;
                    break;
                }
                ran++;
            } catch (Exception e) {
                error = "Lỗi khi chạy lệnh '" + cmd + "': " + e.getClass().getSimpleName()
                        + (e.getMessage() != null ? " - " + e.getMessage() : "");
                break;
            }
        }

        if (error != null) {
            failedCount.incrementAndGet();
            getLogger().warning("❌ Giao thất bại '" + product + "' cho " + player.getName() + ": " + error);
            return new BridgeClient.Result(d.id, false, truncate(error, 500));
        }

        deliveredCount.incrementAndGet();
        getLogger().info("✅ Đã giao '" + product + "' cho " + player.getName() + " (" + ran + " lệnh)");
        notifyPlayer(player, product);
        return new BridgeClient.Result(d.id, true, "Đã giao " + ran + " lệnh cho " + player.getName());
    }

    private String applyPlaceholders(String raw, Player player) {
        String cmd = raw.trim();
        while (cmd.startsWith("/")) cmd = cmd.substring(1).trim();
        return cmd.replace("{username}", player.getName())
                .replace("{user_name}", player.getName())
                .replace("{player}", player.getName())
                .replace("{uuid}", player.getUniqueId().toString());
    }

    private void notifyPlayer(Player player, String product) {
        FileConfiguration cfg = getConfig();
        try {
            if (cfg.getBoolean("notify.chat.enabled", true)) {
                for (String line : cfg.getStringList("notify.chat.messages")) {
                    player.sendMessage(color(line.replace("{product}", product).replace("{player}", player.getName())));
                }
            }
            if (cfg.getBoolean("notify.title.enabled", true)) {
                player.sendTitle(
                        color(cfg.getString("notify.title.title", "&6&lCẢM ƠN BẠN!").replace("{product}", product)),
                        color(cfg.getString("notify.title.subtitle", "&fĐã nhận &e{product}").replace("{product}", product)),
                        10, 60, 20);
            }
            if (cfg.getBoolean("notify.sound.enabled", true)) {
                Sound sound;
                try {
                    sound = Sound.valueOf(cfg.getString("notify.sound.name", "ENTITY_PLAYER_LEVELUP").toUpperCase(Locale.ROOT));
                } catch (IllegalArgumentException ex) {
                    sound = Sound.ENTITY_PLAYER_LEVELUP;
                }
                player.playSound(player.getLocation(), sound, 1.0f, 1.0f);
            }
        } catch (Exception e) {
            getLogger().warning("Không gửi được thông báo cho " + player.getName() + ": " + e.getMessage());
        }
    }

    // ==================== Events ====================

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        requestPoll(60L); // ~3 giây sau khi vào server
        needAdvancements.add(event.getPlayer().getUniqueId());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        if (client == null || statsTask == null || stats.advancementTotal() == 0) return;
        Player p = event.getPlayer();
        needAdvancements.remove(p.getUniqueId());
        try {
            JsonArray rows = new JsonArray();
            rows.add(stats.collect(p, false));
            sendStatsAsync(rows, false, null);
        } catch (Exception e) {
            getLogger().fine("Không đọc được thống kê khi thoát: " + e.getMessage());
        }
    }

    @EventHandler
    public void onAdvancement(PlayerAdvancementDoneEvent event) {
        if (!event.getAdvancement().getKey().getKey().startsWith("recipes/")) {
            needAdvancements.add(event.getPlayer().getUniqueId());
        }
    }

    // ==================== Command ====================

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("bncshop.admin")) {
            sender.sendMessage(color("&cBạn không có quyền dùng lệnh này."));
            return true;
        }
        String sub = args.length > 0 ? args[0].toLowerCase(Locale.ROOT) : "status";

        switch (sub) {
            case "reload":
                loadAndStart();
                sender.sendMessage(color(prefix() + "&aĐã tải lại config."
                        + (client == null ? " &c(Chưa có bridge.secret — không giao hàng)" : "")));
                return true;

            case "poll":
                if (client == null) {
                    sender.sendMessage(color(prefix() + "&cChưa cấu hình bridge.secret."));
                    return true;
                }
                requestPoll(1L);
                sender.sendMessage(color(prefix() + "&aĐã yêu cầu kiểm tra đơn hàng ngay."));
                return true;

            case "status":
                sendStatus(sender);
                return true;

            case "syncstats":
                if (client == null) {
                    sender.sendMessage(color(prefix() + "&cChưa cấu hình bridge.secret."));
                    return true;
                }
                sender.sendMessage(color(prefix() + "&7Đang đọc thống kê của mọi người chơi..."));
                startBackfill(sender);
                return true;

            default:
                sender.sendMessage(color(prefix() + "&eDùng: /" + label + " <status|reload|poll|syncstats>"));
                return true;
        }
    }

    private void sendStatus(CommandSender sender) {
        SimpleDateFormat fmt = new SimpleDateFormat("HH:mm:ss dd/MM");
        String url = getConfig().getString("bridge.url", DEFAULT_URL);
        List<String> lines = new ArrayList<>();
        lines.add("&6&m-----&r &6&lBuildnChill Shop &7v" + getDescription().getVersion() + " &6&m-----");
        lines.add("&7Bridge: &f" + url);
        lines.add("&7Lần poll cuối: &f" + (lastPollAt == 0 ? "chưa" : fmt.format(new Date(lastPollAt))));
        lines.add("&7Thành công cuối: &f" + (lastSuccessAt == 0 ? "chưa" : fmt.format(new Date(lastSuccessAt))));
        lines.add("&7Đã giao: &a" + deliveredCount.get() + " &7| Thất bại: &c" + failedCount.get()
                + " &7| Chờ gửi kết quả: &e" + pendingResults.size());
        lines.add("&7Lỗi gần nhất: " + (lastError == null ? "&akhông có" : "&c" + lastError));
        for (String l : lines) sender.sendMessage(color(l));

        BridgeClient bridge = client;
        if (bridge == null) {
            sender.sendMessage(color("&cChưa cấu hình bridge.secret — không thể ping."));
            return;
        }
        sender.sendMessage(color("&7Đang ping bridge..."));
        Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
            long start = System.currentTimeMillis();
            String msg;
            try {
                bridge.ping();
                msg = "&aPing bridge OK &7(" + (System.currentTimeMillis() - start) + "ms)";
            } catch (BridgeClient.BridgeException e) {
                msg = "&cPing thất bại: " + e.getMessage();
            }
            final String out = msg;
            Bukkit.getScheduler().runTask(this, () -> sender.sendMessage(color(out)));
        });
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1 && sender.hasPermission("bncshop.admin")) {
            List<String> out = new ArrayList<>();
            for (String s : Arrays.asList("status", "reload", "poll", "syncstats")) {
                if (s.startsWith(args[0].toLowerCase(Locale.ROOT))) out.add(s);
            }
            return out;
        }
        return Collections.emptyList();
    }

    // ==================== Helpers ====================

    private String prefix() {
        return getConfig().getString("notify.prefix", "&8[&6BnC-Shop&8] ");
    }

    private static String color(String s) {
        return ChatColor.translateAlternateColorCodes('&', s == null ? "" : s);
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
