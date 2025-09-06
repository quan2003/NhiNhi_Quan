# Quán ăn Nhi Nhi — Full-stack quản lý quán

## Tính năng
- Frontend khách: Trang chủ, menu, giỏ hàng, checkout (COD / chuyển khoản, hiển thị QR placeholder).
- Backend: API sản phẩm (CRUD), đơn hàng (phân trang, cập nhật trạng thái), báo cáo (doanh thu & lợi nhuận theo ngày/tháng).
- Admin: đăng nhập bằng password -> nhận token, quản lý sản phẩm, đơn hàng, báo cáo (Chart.js).

## Chạy thử
```bash
cd quan-restaurant-app
cp .env.example .env   # (tuỳ chọn) đổi mật khẩu/tokens
npm install
npm start
```
- Mặc định chạy ở http://localhost:3000
- Khách: http://localhost:3000/
- Admin: http://localhost:3000/admin/login.html (mật khẩu mặc định: `admin123`)

## Cấu trúc
```
.
├── server.js
├── db.json
├── public/           # trang khách
└── admin/            # trang quản trị
```

## Ghi chú
- Dữ liệu lưu trong `db.json`. Sản phẩm có `priceSell` (giá bán) và `priceCost` (giá vốn). Lợi nhuận = doanh thu - chi phí.
- API có header bảo vệ cho admin: `x-admin-token: <ADMIN_TOKEN>` (mặc định: `changeme`).
