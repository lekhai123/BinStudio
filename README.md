# BinStudio - Nền Tảng Thương Mại Điện Tử Thời Trang Quý Ông

Hệ thống quản lý bán hàng và mua sắm trực tuyến chuyên về âu phục nam (Vest Suit, Trousers, Shirts, Áo Dài, Phụ kiện). 
Dự án tích hợp đầy đủ quy trình từ chọn size, quản lý kho, tự động tính phí vận chuyển qua Giao Hàng Nhanh (GHN), thanh toán mã VietQR qua cổng PayOS, 
lưu trữ media đa định dạng (Ảnh & Video) trên Cloudinary, gửi thông báo xác nhận và thông báo hệ thống qua Telegram Bot.

---

## Kiến Trúc Dự Án & Thiết Kế (System Architecture)

Dự án áp dụng mô hình kiến trúc Monolithic MVC (Model - View - Controller) kết hợp Server-Side Rendering & tĩnh:

- **Frontend (Giao diện):** 
  - Tích hợp theo hướng tinh gọn: cấu trúc HTML kết hợp trực tiếp cùng CSS nội bộ và JavaScript xử lý DOM trên cùng từng file view (`view/user/` và `view/admin/`).
  - Hỗ trợ đa phương tiện: tự động phát hiện và render linh hoạt cả hình ảnh lẫn video (kèm bộ điều khiển âm thanh, preview metadata).
  - Tối ưu hiển thị responsive đa thiết bị (Desktop & Mobile 2 cột chuẩn trải nghiệm mua sắm).
- Backend: Node.js & Express.js điều hướng API và phục vụ tài nguyên.
- Cơ sở dữ liệu: MongoDB kết hợp ODM Mongoose quản lý dữ liệu người dùng, giỏ hàng, đơn hàng, cấu hình trang và nhật ký hệ thống.
- Tích hợp bên thứ ba (Third-party Services):
  - PayOS API:Tạo link/mã thanh toán QR tự động, đồng bộ trạng thái đơn hàng.
  - GHN (Giao Hàng Nhanh) Logistics API: Tính phí vận chuyển theo khu vực hành chính và khởi tạo vận đơn.
  - Cloudinary: Quản lý upload media (ảnh, video catalogue).
  - Resend & SMTP Mailer: Gửi OTP và email xác thực đơn hàng.
  - Telegram Bot: Tự động gửi cảnh báo đơn hàng mới và nhật ký vận hành cho quản trị viên.

---

## Cấu Trúc Thư Mục (Project Structure)
```text

BinStudio/
├── config/
│   └── cloudinary.js                # Cấu hình lưu trữ media Cloudinary
├── Controller/                      # Tầng điều khiển nghiệp vụ (Business Logic)
│   ├── adminAddProductController.js
│   ├── adminConfigController.js
│   ├── adminController.js
│   ├── adminOrder&RevenueController.js
│   ├── adminProductController.js
│   ├── adminUserController.js
│   ├── authAdminController.js
│   ├── authUserController.js
│   ├── ghnController.js
│   ├── userCartController.js
│   ├── userController.js
│   ├── userOrderController.js
│   └── userRsPasswordController.js
├── Middleware/                      # Middleware xác thực & kiểm soát truy cập
│   ├── authAdminMiddleware.js
│   ├── log.js
│   └── userMiddleware.js
├── Models/                          # Mongoose Schema & Database Models
│   ├── cart.js
│   ├── config.js
│   ├── log.js
│   ├── order.js
│   ├── otp.js
│   ├── pagecontent.js
│   ├── product.js
│   └── user.js
├── public/                          # Tài nguyên tĩnh chung
│   └── css/
│       ├── BinStudio.css
│       └── style-admin.css
├── route/                           # Định tuyến các cổng truy cập
│   ├── adminAddProductRoute.js
│   ├── adminAPI&LogRoute.js
│   ├── adminIndexRoute.js
│   ├── adminOrder&RevenueRoute.js
│   ├── adminProductRoute.js
│   ├── adminRoute.js
│   ├── adminUserRoute.js
│   ├── authRoute.js
│   ├── ghnRoute.js
│   ├── userCartRoute.js
│   ├── userIndexRoute.js
│   ├── userOrderRoute.js
│   ├── userProductRoute.js
│   ├── userRoute.js
│   └── userRsPasswordRoute.js
├── Service/                         # Tầng dịch vụ mở rộng bên ngoài
│   ├── ghnService.js                # Xử lý API Giao Hàng Nhanh
│   └── telegramService.js           # Xử lý bot thông báo qua Telegram
├── view/                            # Giao diện người dùng & Quản trị
│   ├── admin/                       # Trang quản trị (Sản phẩm, Đơn hàng, Doanh thu, Cấu hình)
│   └── user/                        # Trang khách hàng (Trang chủ, Chi tiết, Giỏ hàng, Danh mục)
├── .env.example                     # Mẫu biến môi trường
├── package.json
└── server.js                        # Điểm khởi chạy máy chủ Express

```

# Cấu Hình Biến Môi Trường (.env.example)
Tạo một file .env tại thư mục gốc của dự án và khai báo các khóa cấu hình sau:
```text

# Server Config
PORT=3000
NODE_ENV=development
SESSION_SECRET=your_random_session_secret_key

# MongoDB Connection
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/BinStudio?retryWrites=true&w=majority

# Cloudinary (Media Storage)
CLOUDINARY_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Email Service (OTP & Verification)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_app_password

RESEND_API_KEY=re_your_resend_api_key

# Giao Hàng Nhanh (GHN Express API)
GHN_TOKEN=your_ghn_api_token
GHN_SHOP_ID=your_ghn_shop_id

# PayOS Payment Gateway
MERCHAN_ID=your_payos_merchant_id
SECRET_KEY=your_payos_secret_key
PAYOS_CLIENT_ID=your_payos_client_id
PAYOS_API_KEY=your_payos_api_key
PAYOS_CHECKSUM_KEY=your_payos_checksum_key

# Telegram Admin Notification Bot
TOKEN=your_telegram_bot_token
ADMIN_CHAT_ID=your_telegram_chat_id
```



# Hướng Dẫn Cài Đặt & Khởi Chạy (Local Development)

1. Yêu cầu môi trường
Node.js: v18.0.0 trở lên

NPM: v9.0.0 trở lên

Cơ sở dữ liệu MongoDB (Local hoặc MongoDB Atlas)

2. Cài đặt các gói phụ thuộc

Tại thư mục gốc dự án, mở Terminal/PowerShell và chạy:

npm install

3. Khởi động hệ thống

Chế độ phát triển (Tự reload khi sửa code):

npx nodemon server.js

Truy cập tại: http://localhost:3000