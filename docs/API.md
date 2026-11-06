# API reference

Base URL `/api`. JSON. Đăng nhập nhận cookie session `nodo.sid` (HttpOnly, SameSite Strict); dùng cookie cho request sau. API thay đổi dữ liệu cần header `X-CSRF-Token` lấy từ response login hoặc `GET /auth/me`. Session được lưu trong collection `sessions` của MongoDB bằng connect-mongo và có TTL index. Không dùng JWT trong base này; session có thể thu hồi phía server.

Database dùng Mongoose models trong `models/`, kết nối qua `src/database/mongodb.js`. MongoDB `_id` là string để giữ nguyên Device ID/user ID từ bản trước; API trả trường `id` để frontend tiếp tục dùng. Các trường `config`, `reported_state` và `payload` là object JSON; timestamp là ISO UTC. `/api/health` chỉ trả thành công khi MongoDB đã kết nối.

Response lỗi: `{ "error": "Thông báo" }`. HTTP 400 validate, 401 chưa đăng nhập, 403 thiếu quyền, 404 không tồn tại, 409 xung đột, 503 broker chưa sẵn sàng, 504 broker chưa xác nhận.

| Method | Path | Quyền | Chức năng |
| --- | --- | --- | --- |
| GET | `/health` | Public | Liveness |
| GET | `/public-config` | Public | Tên app và demo flag, không có secrets |
| POST | `/auth/login` | Public, rate limit | `{email,password}` |
| GET | `/auth/me` | Đăng nhập | User, CSRF, demo mode |
| POST | `/auth/logout` | Đăng nhập | Hủy session |
| PATCH | `/auth/password` | Đăng nhập | `{currentPassword,password}` |
| GET | `/overview` | Theo phạm vi node | Dashboard |
| GET | `/devices` | Theo phạm vi node | Danh sách node |
| GET | `/devices/:id` | Được cấp quyền | Chi tiết, events và viewer_ids |
| POST | `/devices` | Admin | Đăng ký node |
| PATCH | `/devices/:id` | Admin | Sửa metadata, owner, chia sẻ quyền xem |
| POST | `/devices/:id/lifecycle` | Admin | `{state}` |
| PATCH | `/devices/:id/config` | Admin / Operator sở hữu | Gửi cấu hình, HTTP 202 |
| POST | `/devices/:id/commands` | Admin / Operator sở hữu | `{actuator,value}`, HTTP 202 |
| GET | `/telemetry` | Theo phạm vi node | Filter/history/CSV |
| GET | `/commands` | Theo phạm vi node | 100 lệnh gần nhất |
| GET | `/alerts` | Theo phạm vi node | 100 cảnh báo gần nhất |
| PATCH | `/alerts/:id/acknowledge` | Admin / Operator sở hữu | Xác nhận cảnh báo |
| GET | `/users` | Admin | Danh sách không có password hash |
| POST | `/users` | Admin | Tạo tài khoản |
| PATCH | `/users/:id` | Admin | Sửa/khóa/đặt lại mật khẩu |
| GET | `/audit` | Admin | 200 audit log gần nhất |
| GET | `/settings` | Đăng nhập | Workspace và trạng thái broker |
| PATCH | `/settings` | Admin | Sửa cấu hình workspace |
| POST | `/demo/devices/:id/connection` | Admin, demo | `{offline:true/false}` |

## Body mẫu

Đăng ký:

```json
{ "id":"node-03", "name":"Node môi trường 2", "profile":"climate", "location":"Phòng B", "owner_id":"user-operator", "viewer_ids":["user-viewer"] }
```

Sửa metadata gửi name/location/owner_id/viewer_ids; không đổi id/profile. Chủ sở hữu phải là Admin hoặc Operator hoạt động. Chia sẻ quyền xem không cấp quyền điều khiển.

Tạo user:

```json
{ "name":"Nguyễn Văn A", "email":"a@example.com", "password":"a-strong-password", "role":"operator", "status":"active" }
```

PATCH user gửi đầy đủ name/email/role/status; password là tùy chọn. Password tối thiểu 10 ký tự, tối đa 128. Thay đổi user sẽ thu hồi các session khác của user đó.

PATCH config climate: `{ "mode":"MANUAL", "fanOn":30, "fanOff":28, "temperatureAlert":35 }`.

PATCH config lighting: `{ "mode":"AUTO", "lightOn":30, "lightOff":45 }`.

PATCH settings: `{ "name":"Phòng thực hành IoT", "timezone":"Asia/Ho_Chi_Minh", "offlineSeconds":35, "retentionDays":30 }`.

Query telemetry: `/telemetry?deviceId=node-01&hours=24&limit=500`. hours 1–168, limit 1–2000. Bỏ deviceId để lấy các node được cấp. Thêm `format=csv` để xuất CSV. Bảng UI hiển thị tối đa 100 dòng, query limit dùng cho chart/export. Độ sáng là phần trăm tương đối, không phải lux.

## WebSocket

URL cùng origin `/ws`, dùng cookie session. Từ chối client chưa đăng nhập/khác origin. Message `{ "type":"telemetry|device|command|alert|user|settings|broker", "timestamp":"UTC ISO" }` chỉ là thông báo dữ liệu thay đổi; FE gọi lại API để lấy dữ liệu đúng phạm vi. Không broadcast dữ liệu người dùng hoặc telemetry toàn hệ thống đến mọi người.

## Điểm mở rộng

Phân trang/cursor, truy vấn aggregate, device credential rotation, provisioning có cơ chế khôi phục khi gián đoạn, resolve cảnh báo, reset password qua email, monitoring/backup và OpenAPI schema có thể thêm theo checklist. Chưa có API public cho ESP32 qua HTTP; firmware gửi telemetry/ACK qua MQTT.
