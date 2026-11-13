# BuildnChill Shop Plugin v2

Plugin tự động giao vật phẩm mà người chơi mua trên website **buildnchill.id.vn** vào game.

Từ v2, plugin **không còn kết nối trực tiếp Supabase** (không còn anon key, không còn Discord webhook trong plugin).
Plugin chỉ nói chuyện với **Netlify plugin bridge** của website bằng một khóa bí mật riêng.
Thông báo Discord (đã giao / giao lỗi) được website gửi phía server.

## Yêu cầu

- Paper / Spigot **1.20+**
- Java **17+**
- Maven 3.6+ (chỉ khi tự build)

## Build

```bash
mvn clean package
```

File JAR: `target/MinecraftShopPlugin-2.0.0.jar`

## Cài đặt

1. Xóa bản cũ `MinecraftShopPlugin-1.0.0.jar` trong `plugins/` (nếu có).
2. Copy `MinecraftShopPlugin-2.0.0.jar` vào `plugins/`, khởi động lại server.
3. Mở `plugins/MinecraftShopPlugin/config.yml` và đặt `bridge.secret` (xem bên dưới).
   Nếu đang có `config.yml` của v1 thì xóa đi để plugin tạo file mới.
4. Gõ `/bncshop reload` rồi `/bncshop status` — thấy **Ping bridge OK** là xong.

## Cấu hình

```yaml
bridge:
  url: "https://buildnchill.id.vn/api/plugin-bridge"
  secret: "chuoi-bi-mat-cua-ban"

poll:
  interval_seconds: 10
```

### Lấy `bridge.secret`

`bridge.secret` **phải trùng** với biến môi trường `PLUGIN_SECRET` trên Netlify:

1. Tự tạo một chuỗi ngẫu nhiên dài (≥ 32 ký tự), ví dụ:
   `openssl rand -hex 32` hoặc dùng trình tạo mật khẩu.
2. Netlify → Project configuration → Environment variables → thêm `PLUGIN_SECRET` = chuỗi đó → Deploy lại site.
3. Dán đúng chuỗi đó vào `bridge.secret` trong `config.yml` → `/bncshop reload`.

Sai secret → log báo `HTTP 401 - sai bridge.secret`.

Phần `notify` trong config cho phép bật/tắt và sửa tin nhắn chat, title và âm thanh khi người chơi nhận hàng
(hỗ trợ mã màu `&`, biến `{product}`, `{player}`).

## Cách hoạt động

1. Người chơi thanh toán trên website (chuyển khoản SePay hoặc ví) → website đưa đơn vào hàng chờ giao.
2. Mỗi `interval_seconds` giây plugin gửi danh sách người chơi đang online lên bridge và nhận về các đơn cần giao.
3. Plugin chạy lệnh bằng console cho từng đơn, gửi tin nhắn/title/âm thanh cho người chơi,
   rồi báo kết quả (thành công / thất bại) về bridge.
4. Người chơi offline → đơn được giữ lại, tự giao khi họ vào server (plugin kiểm tra lại ~3 giây sau khi join).
5. Nếu không gửi được kết quả (mất mạng), plugin giữ kết quả và gửi lại ở lần sau — **không chạy lệnh 2 lần**.

## Lệnh sản phẩm (nhập trong trang Admin)

- **Mỗi dòng là một lệnh**, không cần dấu `/` ở đầu (có cũng được, plugin tự bỏ).
- Biến thay thế:
  - `{username}`, `{user_name}`, `{player}` → tên người chơi (đúng chữ hoa/thường trong game)
  - `{uuid}` → UUID người chơi

Ví dụ gói VIP:

```
lp user {player} parent set vip
give {player} diamond 64
broadcast &6{player} &avừa mua gói &eVIP&a!
```

Một đơn chỉ được tính **thành công** khi tất cả lệnh chạy được; lệnh lỗi → đơn được báo thất bại kèm tên lệnh lỗi
để admin xử lý trên website.

## Lệnh trong game

| Lệnh | Mô tả |
|------|-------|
| `/bncshop status` | Xem trạng thái, lần poll cuối, lỗi gần nhất, ping bridge |
| `/bncshop poll` | Kiểm tra đơn hàng ngay lập tức |
| `/bncshop reload` | Tải lại `config.yml` |

Alias: `/bnc`. Quyền: `bncshop.admin` (mặc định OP).
