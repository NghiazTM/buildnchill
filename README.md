# 🌊 BuildnChill Minecraft - Ocean Summer 2026 🏝️

<div align="center">
  <img src="public/favicon.ico" width="100" height="100" alt="BuildnChill Logo">
  <h3>✨ Trải nghiệm Minecraft chuyên nghiệp - Đắm mình trong Đại dương Mùa Hè 🌊 ✨</h3>
  <p align="center">
    <img src="https://img.shields.io/badge/React-18.x-61DAFB?logo=react" alt="React">
    <img src="https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite" alt="Vite">
    <img src="https://img.shields.io/badge/Supabase-DB-3ECF8E?logo=supabase" alt="Supabase">
    <img src="https://img.shields.io/badge/Framer_Motion-UI-FF69B4?logo=framer" alt="Framer Motion">
    <img src="https://img.shields.io/badge/Discord-Sync-5865F2?logo=discord" alt="Discord">
  </p>
</div>

---

## 🌟 Giới Thiệu

**BuildnChill Summer** là nền tảng quản trị và cửa hàng trực tuyến lấy cảm hứng từ đại dương xanh mát dành riêng cho server Minecraft BuildnChill. Ứng dụng được xây dựng trên nền tảng React hiện đại, mang đến hơi thở mùa hè sôi động với hệ thống dữ liệu thời gian thực và giao diện tối ưu.

## 🚀 Tính Năng Nổi Bật

### 🏖️ Giao Diện Ocean Summer
- **Summer-Theme Sync**: Đồng bộ toàn bộ giao diện theo tông màu Xanh Đại Dương (Deep Blue) & Vàng Cát (Sand Yellow).
- **Hiệu ứng Sóng Biển**: Hiệu ứng chuyển động mượt mà, sóng biển và cá heo bơi lội sống động qua Framer Motion.
- **Summer Glassmorphism**: Phong cách thiết kế kính mờ hiện đại, mang lại cảm giác nhẹ nhàng, tinh tế.

### 🛡️ Hệ Thống Quản Trị Chuyên Nghiệp
- **Soft Delete (Xóa Mềm)**: Bảo toàn dữ liệu (Sản phẩm, Đơn hàng, Tin tức) với cơ chế `is_deleted`, giúp khôi phục dễ dàng khi cần thiết.
- **Dashboard Thống Kê**: Theo dõi doanh thu theo ngày/tháng/năm và quản lý các "Đại gia" nạp top.
- **Quản lý Cửa Hàng**: Thêm, sửa, xóa Sản phẩm và Danh mục trực quan ngay trong Admin Panel.

### 🤖 Tự Động Hóa Toàn Diện
- **SePay Automation**: Tích hợp hệ thống nạp tiền tự động qua QR Code và Banking, xác nhận giao dịch trong 30 giây.
- **Discord Sync**: Thông báo thời gian thực các sự kiện Nạp tiền (kênh Bank), Mua hàng (kênh Shop) và Liên hệ (kênh Support).
- **Minecraft Command Queue**: Tự động thực thi lệnh trao quà trong game ngay khi thanh toán thành công.

## 🛠️ Công Nghệ Sử Dụng

- **Frontend**: React 18, Vite, Framer Motion, React Icons.
- **Styling**: CSS3 (Summer Theme), Bootstrap 5.
- **Backend-as-a-Service**: Supabase (PostgreSQL, Auth, Storage, Real-time).
- **Automation**: Discord Webhook API, Netlify Functions.

---

## 📦 Cài Đặt & Khởi Chạy

### 1. Cài đặt Dependencies
```bash
npm install
```

### 2. Cấu hình Môi trường
Tạo file `.\.env` tại thư mục gốc và cấu hình các thông số:
```env
VITE_SUPABASE_URL=your_url
VITE_SUPABASE_ANON_KEY=your_key
VITE_DISCORD_BANK_WEBHOOK=your_webhook
VITE_DISCORD_SHOP_WEBHOOK=your_webhook
VITE_DISCORD_CONTACT_WEBHOOK=your_webhook
VITE_BANK_ACCOUNT=your_account
VITE_BANK_NAME=your_bank
VITE_BANK_ACCOUNT_NAME=your_name
```

### 3. Setup Database
Chạy các scripts migration trong Supabase SQL Editor:
1. `.\SHOP_SETUP.sql`
2. `.\SOFT_DELETE_MIGRATION.sql`
3. `.\SEPAY_INTEGRATION_SETUP.sql`

### 4. Khởi chạy Development
```bash
npm run dev
```

## 📁 Cấu Trúc Thư Mục Chính

```text
src/
├── components/   # Các thành phần Summer UI (Shop, Admin, Carousel)
├── context/      # Quản lý dữ liệu tập trung (DataContext)
├── pages/        # Các trang chính (Home, Shop, News, Recharge)
├── styles/       # Hệ thống CSS Mùa Hè (summer-theme.css)
└── utils/        # Hàm xử lý (helpers, constants)
```

---

<div align="center">
  <p>Hãy tận hưởng một mùa hè tuyệt vời cùng BuildnChill! 🌴🥥🐚</p>
  <p><b>BuildnChill Development Team</b></p>
</div>
