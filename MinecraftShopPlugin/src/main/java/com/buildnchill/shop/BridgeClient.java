package com.buildnchill.shop;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * HTTP client cho Netlify plugin bridge.
 * Tất cả method đều blocking — chỉ gọi từ thread async.
 */
public class BridgeClient {

    /** Lỗi khi gọi bridge (kèm HTTP status nếu có, 0 nếu lỗi kết nối). */
    public static class BridgeException extends Exception {
        private final int status;

        public BridgeException(int status, String message) {
            super(message);
            this.status = status;
        }

        public int getStatus() {
            return status;
        }
    }

    /** Một đơn giao hàng do bridge trả về. */
    public static class Delivery {
        public final String id;
        public final String orderId;
        public final String mcUsername;
        public final String productName;
        public final List<String> commands;

        public Delivery(String id, String orderId, String mcUsername, String productName, List<String> commands) {
            this.id = id;
            this.orderId = orderId;
            this.mcUsername = mcUsername;
            this.productName = productName;
            this.commands = commands;
        }
    }

    /** Kết quả giao hàng gửi lại cho bridge. */
    public static class Result {
        public final String id;
        public final boolean success;
        public final String message;

        public Result(String id, boolean success, String message) {
            this.id = id;
            this.success = success;
            this.message = message;
        }
    }

    private static final String USER_AGENT = "BuildnChillShop/2.0";

    private final Gson gson = new Gson();
    private final HttpClient http;
    private final String url;
    private final String secret;

    public BridgeClient(String url, String secret) {
        this.url = url == null ? "" : url.trim();
        this.secret = secret == null ? "" : secret.trim();
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    private HttpRequest.Builder request(String fullUrl) {
        return HttpRequest.newBuilder(URI.create(fullUrl))
                .timeout(Duration.ofSeconds(10))
                .header("X-Plugin-Secret", secret)
                .header("Content-Type", "application/json")
                .header("User-Agent", USER_AGENT);
    }

    private String withQuery(String query) {
        return url + (url.contains("?") ? "&" : "?") + query;
    }

    private JsonObject send(HttpRequest req) throws BridgeException {
        HttpResponse<String> res;
        try {
            res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BridgeException(0, "Bị gián đoạn khi gọi bridge");
        } catch (Exception e) {
            throw new BridgeException(0, "Không kết nối được bridge: " + e.getClass().getSimpleName()
                    + (e.getMessage() != null ? " - " + e.getMessage() : ""));
        }

        int code = res.statusCode();
        if (code == 401 || code == 403) {
            throw new BridgeException(code, "HTTP " + code + " - sai bridge.secret (phải trùng biến PLUGIN_SECRET trên Netlify)");
        }
        if (code < 200 || code >= 300) {
            throw new BridgeException(code, "HTTP " + code + " từ bridge");
        }

        try {
            JsonElement el = JsonParser.parseString(res.body() == null ? "" : res.body());
            if (!el.isJsonObject()) throw new BridgeException(code, "Phản hồi bridge không phải JSON object");
            JsonObject obj = el.getAsJsonObject();
            if (obj.has("ok") && !obj.get("ok").getAsBoolean()) {
                String err = obj.has("error") && !obj.get("error").isJsonNull() ? obj.get("error").getAsString() : "ok=false";
                throw new BridgeException(code, "Bridge báo lỗi: " + err);
            }
            return obj;
        } catch (BridgeException e) {
            throw e;
        } catch (Exception e) {
            throw new BridgeException(code, "Không đọc được JSON từ bridge: " + e.getMessage());
        }
    }

    /** GET ?ping=1 */
    public void ping() throws BridgeException {
        send(request(withQuery("ping=1")).GET().build());
    }

    /** GET ?online=... → danh sách đơn cần giao cho người chơi đang online. */
    public List<Delivery> fetch(Collection<String> onlineNames) throws BridgeException {
        String joined = String.join(",", onlineNames);
        String q = "online=" + URLEncoder.encode(joined, StandardCharsets.UTF_8);
        JsonObject obj = send(request(withQuery(q)).GET().build());

        List<Delivery> list = new ArrayList<>();
        if (!obj.has("deliveries") || !obj.get("deliveries").isJsonArray()) return list;

        for (JsonElement el : obj.getAsJsonArray("deliveries")) {
            if (!el.isJsonObject()) continue;
            JsonObject d = el.getAsJsonObject();
            String id = str(d, "id");
            String user = str(d, "mc_username");
            if (id == null || user == null) continue;

            List<String> cmds = new ArrayList<>();
            if (d.has("commands") && d.get("commands").isJsonArray()) {
                for (JsonElement c : d.getAsJsonArray("commands")) {
                    if (c.isJsonPrimitive()) {
                        String s = c.getAsString().trim();
                        if (!s.isEmpty()) cmds.add(s);
                    }
                }
            }
            list.add(new Delivery(id, str(d, "order_id"), user, str(d, "product_name"), cmds));
        }
        return list;
    }

    /** POST {results:[...]} */
    public void report(List<Result> results) throws BridgeException {
        JsonArray arr = new JsonArray();
        for (Result r : results) {
            JsonObject o = new JsonObject();
            o.addProperty("id", r.id);
            o.addProperty("success", r.success);
            o.addProperty("message", r.message);
            arr.add(o);
        }
        JsonObject body = new JsonObject();
        body.add("results", arr);
        send(request(url).POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body), StandardCharsets.UTF_8)).build());
    }

    private static String str(JsonObject o, String key) {
        if (!o.has(key) || o.get(key).isJsonNull()) return null;
        try {
            return o.get(key).getAsString();
        } catch (Exception e) {
            return null;
        }
    }
}
