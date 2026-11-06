# Kết nối MongoDB Atlas

## Điền URI

1. Mở cluster trong Atlas → **Connect → Drivers → Node.js**.
2. Sao chép connection string, thay DB username/password thật; URL encode ký tự đặc biệt trong mật khẩu.
3. Trong **Network Access / IP Access List**, thêm địa chỉ IP hiện tại của máy chạy backend. DB user cần quyền đọc/ghi database `iot_admin`.
4. Tạo `.env` từ `.env.example` nếu chưa có, rồi điền cấu hình:

```dotenv
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/iot_admin?retryWrites=true&w=majority
MONGODB_DB_NAME=iot_admin
```

DB user khác tài khoản đăng nhập Atlas. Tham khảo [hướng dẫn kết nối chính thức](https://www.mongodb.com/docs/atlas/driver-connection/).

## Kiểm tra

```powershell
npm.cmd run db:check
```

Thành công: `MongoDB kết nối thành công. Database: iot_admin`. Script kiểm tra kết nối/index/ping, không seed user/node và không in URI/mật khẩu.

Nếu muốn lấy dữ liệu từ SQLite cũ, chạy `npm.cmd run migrate:sqlite` trước lần `npm.cmd run dev` đầu tiên trên database mới. Nếu không cần dữ liệu cũ, `npm.cmd run dev` tự seed khi chưa có user.

Sau khi chạy, xem collections tại **Browse Collections → iot_admin**: users, devices, telemetries, commands, alerts, auditlogs, deviceevents, settings, sessions. Chỉ telemetry từ hai node được giả lập khi bật demo; tất cả dữ liệu vẫn lưu vào Atlas thật.

## Khi chưa kết nối

- Thiếu URI/placeholder: điền đúng dòng MONGODB_URI trong `.env` và lưu file.
- Sai mật khẩu: dùng mật khẩu DB user, kiểm tra URL encoding.
- Timeout/SRV: kiểm tra IP Access List, cluster đang hoạt động, kết nối mạng và DNS của máy.
- Node báo `querySrv ECONNREFUSED` dù hệ điều hành tìm được cluster: có thể đặt `MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8` trong `.env`. Cấu hình chỉ đổi resolver của tiến trình Node, không thay DNS hệ thống.
- Không đủ quyền: cấp quyền readWrite cho `iot_admin`, gồm quyền tạo collection/index.
- Đã sửa `.env` mà task cũ còn lỗi: dừng task bằng Ctrl+C và chạy lại.

Không cần gửi URI chứa mật khẩu vào chat. `.env` được ignore; `.env.example` chỉ chứa placeholder.
