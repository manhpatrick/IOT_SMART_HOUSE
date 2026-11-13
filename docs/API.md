# API reference

Base URL `/api`. JSON. Đăng nhập nhận cookie session `nodo.sid` (HttpOnly, SameSite Strict); dùng cookie cho request sau. API thay đổi dữ liệu cần header `X-CSRF-Token` lấy từ response login hoặc `GET /auth/me`. Session được lưu trong collection `sessions` của MongoDB bằng connect-mongo và có TTL index. Không dùng JWT trong base này; session có thể thu hồi phía server.

Database dùng Mongoose models trong `database/models/`, kết nối qua `database/mongodb.js`. MongoDB `_id` là string để giữ nguyên Device ID/user ID từ bản trước; API trả trường `id` để frontend tiếp tục dùng. Các trường `config`, `reported_state` và `payload` là object JSON; timestamp là ISO UTC. `/api/health` chỉ trả thành công khi MongoDB đã kết nối.

Response lỗi: `{ "error": "Thông báo" }`. HTTP 400 validate, 401 chưa đăng nhập, 403 thiếu quyền, 404 không tồn tại, 409 xung đột, 503 broker chưa sẵn sàng, 504 broker chưa xác nhận.

| Method | Path | Quyền | Chức năng |
| --- | --- | --- | --- |
| GET | `/health` | Public | Liveness |
| GET | `/public-config` | Public | Tên app và demo flag, không có secrets |
| POST | `/auth/login` | Public, rate limit | `{email,password}` |
| POST | `/auth/register` | Public, rate limit | `{name,email,password,role:operator/viewer}`; không tạo admin |
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

## Nhiều nhà, phòng và thành viên

Quyền operator/viewer được xác minh theo từng nhà; global admin có phạm vi toàn hệ thống. Node trong nhà dùng quyền thành viên của nhà, không dùng `viewer_ids` cũ. Tất cả mutation bên dưới cần CSRF và session. Operator chỉ mời được **viewer**, không tự cấp admin.

| Method | Path | Quyền / body |
| --- | --- | --- |
| GET | `/homes` | Nhà được tham gia; admin xem tất cả. Kèm access_role và counts |
| POST | `/homes` | Operator/admin; `{name,address?}`. Admin có thể chọn `owner_id` operator |
| GET | `/homes/:homeId` | Thành viên; nhà, phòng, nodes, members; audit chỉ operator/admin |
| PATCH | `/homes/:homeId` | Operator của nhà/admin; `{name,address?}` |
| POST | `/homes/:homeId/rooms` | Operator của nhà/admin; `{name}` |
| PATCH | `/homes/:homeId/rooms/:roomId` | Operator của nhà/admin; `{name}` |
| DELETE | `/homes/:homeId/rooms/:roomId` | Operator của nhà/admin; reject 409 nếu còn node |
| PATCH | `/homes/:homeId/devices/:deviceId` | Operator của nhà/admin; `{name,room_id:null/string}`; không chuyển chéo nhà |
| POST | `/devices/:id/claim-code` | Admin; node provisioned/active, chưa có chủ/nhà; trả mã một lần, hạn 24h |
| POST | `/homes/:homeId/claim` | Operator của nhà/admin; `{deviceId,code,room_id:null/string}` |
| GET | `/homes/:homeId/invitations` | Operator của nhà/admin; không trả token/hash |
| POST | `/homes/:homeId/invitations` | Operator của nhà/admin; `{email}`; trả token một lần, hạn 48h |
| DELETE | `/homes/:homeId/invitations/:invitationId` | Operator của nhà/admin; hủy lời mời |
| POST | `/homes/accept-invitation` | Đăng nhập đúng email; `{token}`; viewer trong nhà được mời |
| DELETE | `/homes/:homeId/members/:userId` | Operator của nhà/admin; không xóa chủ nhà; thu hồi phạm vi nhà ngay |

`GET /devices?homeId=...`, `GET /telemetry?homeId=...` lọc theo nhà và kiểm tra quyền. Admin dùng `GET /audit?homeId=...`; operator xem audit trong chi tiết nhà mình. GET device có thêm `home_id`, `room_id`, tên nhà/phòng, `data_status=fresh/stale/missing`, `data_age_seconds`, `pendingCommand`. Khi broker mất kết nối, `connection=unknown`, không mặc định node đang online. Các lệnh/cấu hình/cảnh báo vẫn kiểm tra phạm vi nhà dù biết đúng Device ID.

Password mới: tối thiểu 10 ký tự, tối đa 72 byte UTF-8 để không bị bcrypt cắt đuôi. Mã claim, mã mời và hash tương ứng không xuất trong JSON thông thường/audit. Chi tiết: HOMES-AND-MOBILE.md và FAILURE-HANDLING.md.

## AI và bảo mật tài khoản

| Method | Path | Quyền / chức năng |
| --- | --- | --- |
| GET | `/ai/summary` | Đăng nhập; node climate thuộc phạm vi user, model/state/can_train |
| GET | `/ai/devices/:id` | Quyền đọc node; model/report, tối đa 150 kết quả của model đó; không có weights |
| POST | `/ai/devices/:id/train` | Admin/operator quản lý nhà; `{days:1..30,includeDemo:false,confirmedNormal:true}`; 202 job, một worker đồng thời |
| GET | `/ai/login-history` | Chỉ lịch sử/profile chính user; tối đa 100 sự kiện |
| GET | `/ai/security-alerts` | User xem chính mình, admin xem cảnh báo toàn hệ thống; `?mine=true` để lọc chính mình |
| PATCH | `/ai/security-alerts/:id/review` | Chỉ chủ tài khoản; `{decision:expected/unrecognized}`; không cho admin xác nhận thay user khác |

Response login có thêm `loginAnalysis`; giờ lấy từ server. AI lỗi trả trạng thái unavailable nhưng không chặn password/session hợp lệ. Nhãn `source=hardware` chỉ thể hiện chế độ nhận MQTT thật, không tự chứng minh nguồn vật lý; unknown cũ không được âm thầm dùng huấn luyện. Chi tiết: [AI-GUIDE.md](AI-GUIDE.md).

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

PATCH user gửi đầy đủ name/email/role/status; password là tùy chọn. Password tối thiểu 10 ký tự, tối đa 72 byte UTF-8. Thay đổi user sẽ thu hồi các session khác của user đó.

PATCH config climate: `{ "mode":"MANUAL", "fanOn":30, "fanOff":28, "temperatureAlert":35 }`.

PATCH config lighting: `{ "mode":"AUTO", "lightOn":30, "lightOff":45 }`.

PATCH settings: `{ "name":"Phòng thực hành IoT", "timezone":"Asia/Ho_Chi_Minh", "offlineSeconds":35, "retentionDays":30 }`.

Query telemetry: `/telemetry?deviceId=node-01&hours=24&limit=500`. hours 1–168, limit 1–2000. Bỏ deviceId để lấy các node được cấp. Thêm `format=csv` để xuất CSV. Bảng UI hiển thị tối đa 100 dòng, query limit dùng cho chart/export. Độ sáng là phần trăm tương đối, không phải lux.

## WebSocket

URL cùng origin `/ws`, dùng cookie session. Từ chối client chưa đăng nhập/khác origin. Message `{ "type":"telemetry|device|command|alert|user|settings|broker", "timestamp":"UTC ISO" }` chỉ là thông báo dữ liệu thay đổi; FE gọi lại API để lấy dữ liệu đúng phạm vi. Không broadcast dữ liệu người dùng hoặc telemetry toàn hệ thống đến mọi người.

## Điểm mở rộng

Phân trang/cursor, truy vấn aggregate, device credential rotation, provisioning có cơ chế khôi phục khi gián đoạn, resolve cảnh báo, reset password qua email, monitoring/backup và OpenAPI schema có thể thêm theo checklist. Chưa có API public cho ESP32 qua HTTP; firmware gửi telemetry/ACK qua MQTT.
