# BuildnChill — Giao diện Black & Gold & Module thanh toán v2

Làm **đúng thứ tự** dưới đây. Bỏ bước 1–2 trước khi deploy thì cửa hàng sẽ không thanh toán được.

## 1. Chạy migration Supabase

Supabase Dashboard → **SQL Editor** → dán toàn bộ `PAYMENT_V2_MIGRATION.sql` → **Run**.
Kết quả cuối phải là `PAYMENT V2 MIGRATION OK`. File có thể chạy lại nhiều lần.

Migration sẽ:
- Khoá các quyền nguy hiểm cũ (client tự tạo đơn/sửa sản phẩm/cộng tiền ví/chèn lệnh console).
- Tạo hàng đợi giao vật phẩm `deliveries`, nhật ký giao dịch `payment_transactions`.
- Chuyển các lệnh cũ còn treo trong `pending_commands` sang hàng đợi mới.

## 2. Biến môi trường trên Netlify

Netlify → Project configuration → **Environment variables**:

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | ✅ (đã có) | |
| `SUPABASE_SERVICE_ROLE` | ✅ (đã có) | Service role key — chỉ dùng phía server |
| `SEPAY_API_KEY` | ✅ **mới** | Chuỗi bí mật bạn tự đặt, nhập giống hệt ở SePay (bước 3) |
| `PLUGIN_SECRET` | ✅ **mới** | Chuỗi ngẫu nhiên dài ≥ 32 ký tự, nhập giống hệt trong `config.yml` của plugin |
| `VITE_BANK_ACCOUNT`, `VITE_BANK_ACCOUNT_NAME`, `VITE_BANK_NAME` | ✅ (đã có) | |
| `VITE_BANK_CODE` | tuỳ chọn | Mã ngân hàng VietQR, mặc định `MB` |
| `DISCORD_SHOP_WEBHOOK` | khuyên dùng | Kênh **đơn hàng**. Nếu không đặt sẽ dùng `VITE_DISCORD_SHOP_WEBHOOK` |
| `DISCORD_BANK_WEBHOOK` | khuyên dùng | Kênh **nạp tiền / giao dịch lạ**. Fallback `VITE_DISCORD_BANK_WEBHOOK` |
| `DISCORD_CONTACT_WEBHOOK` | khuyên dùng | Kênh **liên hệ hỗ trợ**. Fallback `VITE_DISCORD_CONTACT_WEBHOOK` |
| `DISCORD_DELIVERY_WEBHOOK` | tuỳ chọn | Kênh **đã giao hàng**; mặc định cập nhật luôn tin nhắn ở kênh đơn hàng |
| `DISCORD_NEWS_WEBHOOK` | tuỳ chọn | Kênh **thông báo tin tức** khi admin đăng bài |
| `DISCORD_NEWS_MENTION` | tuỳ chọn | Ví dụ `@everyone` hoặc `<@&ROLE_ID>` |
| `DISCORD_ADMIN_MENTION` | tuỳ chọn | Người/role được ping khi có sự cố, mặc định `<@741299302495813662>` |

> ⚠️ Các webhook Discord cũ từng bị nhúng vào JavaScript công khai và vào mã plugin trên GitHub.
> Hãy **tạo webhook mới** trong Discord (Edit Channel → Integrations → Webhooks), xoá webhook cũ,
> rồi đặt vào các biến `DISCORD_*` ở trên (không cần tiền tố `VITE_` nữa). Có thể xoá các biến `VITE_DISCORD_*` sau đó.

## 3. Cấu hình SePay

SePay → **Tích hợp Webhooks** → sửa webhook hiện tại:
- URL: `https://buildnchill.id.vn/.netlify/functions/sepay-webhook` (giữ nguyên)
- Kiểu chứng thực: **API Key** → nhập đúng giá trị `SEPAY_API_KEY`
- Bỏ qua nếu nội dung không có code: **Không**

Nội dung chuyển khoản được nhận diện:
- `BNCxxxxxx` → thanh toán đơn hàng (mỗi đơn có mã riêng, kiểm tra đủ số tiền; chuyển thiếu được cộng dồn; chuyển dư được hoàn vào ví nếu người mua có tài khoản).
- `NAP <tên tài khoản>` → nạp ví.
- Giao dịch không khớp → báo vào kênh Discord ngân hàng để admin xử lý.

## 4. Cài plugin Minecraft v2

1. Build: `cd MinecraftShopPlugin && mvn package` → `target/MinecraftShopPlugin-2.0.0.jar`.
2. Xoá jar v1 trong `plugins/`, chép jar v2 vào.
3. **Xoá** `plugins/MinecraftShopPlugin/config.yml` cũ để plugin tạo file mới.
4. Khởi động server, sửa `bridge.secret` = `PLUGIN_SECRET`, rồi `/bncshop reload`.
5. `/bncshop status` phải báo kết nối thành công.

Lệnh sản phẩm (trang Admin → Sản phẩm): **mỗi dòng 1 lệnh console**, placeholder `{username}` `{player}` `{uuid}`.
Ví dụ:
```
lp user {username} parent set vip
give {username} diamond 64
```

## 5. Deploy & kiểm tra

1. Merge nhánh vào `main` → Netlify tự deploy.
2. Mua thử 1 sản phẩm giá thấp bằng QR → kiểm tra: trang tự chuyển "Đã nhận thanh toán", Discord kênh đơn hàng báo 🟡, vào game nhận đồ, Discord chuyển ✅.
3. Nạp thử ví `NAP <tên>` → số dư tự cập nhật, Discord kênh ngân hàng báo.
4. Gửi thử 1 liên hệ → Discord kênh hỗ trợ báo; đổi trạng thái trong Admin → tin nhắn Discord tự cập nhật.

## Luồng hoạt động

```
Khách chọn vật phẩm ─► /api/shop-checkout (server tính giá, tạo mã BNCxxxxxx)
          │                         └─ ví: trừ tiền + tạo đơn + xếp hàng giao (1 giao dịch DB)
          ▼
Chuyển khoản ─► SePay ─► /sepay-webhook (xác thực API key, chống trùng, kiểm tra số tiền)
          ▼
deliveries (hàng đợi) ◄── plugin v2 hỏi /api/plugin-bridge mỗi 10 giây (chỉ người đang online)
          ▼
Plugin chạy lệnh console ─► báo kết quả ─► đơn = "Đã giao" ─► Discord cập nhật ✅
```
