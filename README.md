# Hệ thống IoT thông minh — NODO Admin

Admin cho hai ESP32: **node môi trường (DHT11/DHT22, quạt/còi)** và **node ánh sáng (LDR, LED)**.

**Express 5 + MongoDB/Mongoose + HTML/JavaScript + Tailwind 4 + MQTT + WebSocket.** User, thiết bị, telemetry, lệnh, cảnh báo, audit và session đều lưu trong MongoDB. Khi `DEMO_MODE=true`, hai node được giả lập, dữ liệu vẫn lưu vào MongoDB thật.

## Chạy

Yêu cầu Node.js 24+ và MongoDB Atlas. Đọc [hướng dẫn Atlas](docs/MONGODB-ATLAS.md) nếu cần lấy URI.

Lần đầu lấy mã nguồn và cài thư viện trong PowerShell:

```powershell
git clone https://github.com/manhpatrick/H-th-ng-IOT-th-ng-minh.git iot-admin
cd iot-admin
npm.cmd install
Copy-Item .env.example .env
```

Điền URI Atlas vào `.env` vừa tạo. Nếu đã có `.env` riêng, dùng file hiện có:

```dotenv
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/iot_admin?retryWrites=true&w=majority
MONGODB_DB_NAME=iot_admin
PORT=3080
DEMO_MODE=true
```

`USER/PASSWORD` là tài khoản database của Atlas, không phải tài khoản đăng nhập web admin. Password có ký tự đặc biệt cần URL encode. `.env` được ignore bởi Git.

```powershell
npm.cmd run db:check
npm.cmd run build
npm.cmd run dev
```

Mở **http://127.0.0.1:3080**. Nếu chưa điền URI hoặc database không kết nối được, server báo lỗi và không mở HTTP. Không tự chuyển sang SQLite hay một database giả thay thế.

Trong VS Code: **Ctrl+Shift+B** chạy task **NODO: npm run dev**. **Terminal → Run Task → NODO: Kiểm tra MongoDB** để kiểm tra kết nối. Task Build/Watch Tailwind và npm scripts vẫn dùng được.

## Tài khoản demo

Database mới được khởi tạo tự động khi chạy lần đầu. Database đã có user sẽ được giữ nguyên.

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Admin | admin@nodo.local | Admin@12345 |
| Operator | operator@nodo.local | Operator@12345 |
| Viewer | viewer@nodo.local | Viewer@12345 |

Đây là tài khoản demo. Khi dùng phần cứng/triển khai thật, đặt `DEMO_MODE=false`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` ít nhất 12 ký tự và `SESSION_SECRET` ít nhất 32 ký tự trước khi khởi tạo database mới.

## Cấu trúc theo WebProject

Cách đặt thư mục và tên file theo [repo WebProject của bạn](https://github.com/manhpatrick/WebProject): `models/` ở gốc, `src/controller/*.controller.js`, `src/routes/*Routes.js`, `src/middleware`, `src/database/mongodb.js`, entry point `src/server.js`.

```text
iot-admin/
├── config/
│   └── env.js                    Đọc cấu hình, không hardcode URI
├── models/
│   ├── user.model.js
│   ├── device.model.js
│   ├── telemetry.model.js
│   ├── command.model.js
│   ├── alert.model.js
│   ├── audit.model.js
│   ├── device-event.model.js
│   └── setting.model.js
├── src/
│   ├── server.js                 Khởi động sau khi kết nối DB thành công
│   ├── app.js                    Ghép middleware, routes và WebSocket
│   ├── database/
│   │   ├── mongodb.js            Mongoose connection, collections/indexes
│   │   ├── seed-data.js          Khởi tạo dữ liệu khi DB trống
│   │   ├── check-connection.js   Ping DB, không in URI/mật khẩu
│   │   └── migrate-sqlite.js     Chuyển dữ liệu cũ, đọc SQLite read-only
│   ├── controller/
│   │   ├── auth.controller.js
│   │   ├── user.controller.js
│   │   ├── device.controller.js
│   │   ├── telemetry.controller.js
│   │   └── dashboard.controller.js
│   ├── routes/                  authRoutes, userRoutes, deviceRoutes...
│   ├── middleware/              auth, admin/operator, CSRF, error handler
│   ├── services/                IoT, MQTT, phân quyền node, session, audit
│   ├── validation/              Zod schemas cho dữ liệu từ FE/ESP32
│   └── utils/                   Defaults, lỗi HTTP, khóa tác vụ theo node
├── public/                      HTML và JS/CSS tĩnh
├── frontend/styles.css          Nguồn Tailwind
├── docs/                        Checklist admin, API, MQTT, Atlas
├── tests/                       MongoDB API, migration, browser QA
├── .vscode/                     Task chạy dự án
├── .env                         URI/secret local, được Git bỏ qua
└── .env.example                 Mẫu cấu hình trong repository
```

Luồng BE: **Route → Middleware → Controller → Service/Model → MongoDB**. Frontend tiếp tục gọi các URL API cũ. IDs API và dữ liệu cũ được giữ tương thích; `payload/config/reported_state` được lưu thành object trong MongoDB.

## Chuyển dữ liệu SQLite cũ

Nếu bạn có database từ bản SQLite trước, đặt file vào `data/nodo.sqlite` rồi chạy migration **trước khi mở server lần đầu trên database Atlas mới**. Database local không được đưa vào repository:

```powershell
npm.cmd run db:check
npm.cmd run migrate:sqlite
npm.cmd run dev
```

Có thể truyền đường dẫn khác: `npm.cmd run migrate:sqlite -- C:\path\nodo.sqlite`.

Migration giữ nguyên ID, hash mật khẩu, chủ sở hữu/quyền xem, telemetry, lịch sử và cấu hình. Chỉ thêm bản ghi chưa có, không ghi đè dữ liệu MongoDB hiện tại; chạy lại không nhân đôi dữ liệu. Lệnh cũ đang pending chuyển thành cancelled để tránh phát lại. Session cũ không chuyển, cần đăng nhập lại.

Nếu email đã thuộc ID khác hoặc Device ID có profile khác trên Atlas, script dừng trước khi nhập để bạn đối chiếu. Nhiều collection được nhập theo thứ tự, không phải một transaction toàn bộ; nếu gián đoạn có thể chạy lại. Không xóa dữ liệu gốc.

## Chức năng admin

- Dashboard realtime, biểu đồ, online/offline, cảnh báo và hoạt động.
- User Admin/Operator/Viewer, khóa tài khoản, đổi mật khẩu, thu hồi phiên.
- Registered → Provisioned → Active, Maintenance/Locked/Decommissioned, lịch sử vòng đời.
- Gán chủ sở hữu và chia sẻ quyền xem từng node; kiểm tra quyền ở BE.
- Telemetry đúng profile/range/timestamp; chống trùng bằng index `(device_id, boot_id, seq)`.
- Auto/Manual, cấu hình ngưỡng, quạt/còi/đèn; pending/applied/failed/timeout/cancelled.
- ACK đúng node và còn hạn; một lệnh pending cho mỗi node bằng unique partial index.
- Cảnh báo nhiệt độ/offline, xác nhận cảnh báo, CSV, audit log và cài đặt retention.
- Cookie HttpOnly/SameSite, CSRF, rate limit login, validate chặn MongoDB selector injection.
- Session MongoDB bằng connect-mongo; TTL index xóa phiên hết hạn.

Xem đầy đủ tại [ADMIN-CHECKLIST.md](docs/ADMIN-CHECKLIST.md), [API.md](docs/API.md) và [MQTT-CONTRACT.md](docs/MQTT-CONTRACT.md).

## Nối ESP32 thật

`DEMO_MODE=false`; cấu hình MQTT_URL, MQTT_USERNAME, MQTT_PASSWORD, MQTT_DYNAMIC_SECURITY. Dùng Mosquitto TLS và ACL riêng mỗi node. Adapter có cấp role/client và thu hồi kết nối bằng Dynamic Security; phần broker/ESP32 thật vẫn cần kiểm thử như trong MQTT contract. Quy tắc Auto chạy ở ESP32; backend lưu/gửi cấu hình và chỉ áp dụng khi nhận ACK.

## Kiểm thử

```powershell
npm.cmd test
npm.cmd run test:ui
```

Test khởi động **mongod thật trong database tạm bằng mongodb-memory-server**, không dùng hay ghi vào Atlas của bạn. Lần đầu package có thể tải binary MongoDB. API test kiểm tra phân quyền, session/TTL, lifecycle, duplicate, command race, ACK/timeout và dữ liệu/session sau restart. Migration test kiểm tra file SQLite read-only và chạy lại không trùng. Browser QA kiểm tra các màn và luồng thao tác trên desktop/mobile, ảnh ở `.artifacts/`.

Khi sửa frontend: `npm.cmd run build` hoặc `npm.cmd run css:watch`. Node watch tự khởi động lại BE khi thay đổi mã phụ thuộc; sau khi sửa `.env`, khởi động lại task dev để nạp cấu hình mới.

## Giới hạn và triển khai

Đây là base chạy một tiến trình Node. Atlas chưa được coi là kết nối thành công nếu chỉ có test database tạm; cần `npm run db:check` với URI thật. Thiết lập HTTPS, secret riêng, DB user chỉ được readWrite database cần dùng, backup/restore và monitoring trước khi triển khai. Chỉ bật TRUST_PROXY=1 sau đúng một proxy đáng tin cậy.

Chưa có OTA, AI, email/Telegram, quên mật khẩu, MFA, rotate credential hoặc phân trang toàn bộ lịch sử. Cấp quyền nhiều bước tại Mosquitto chưa có transaction phân tán; nếu gián đoạn phải kiểm tra role/client đã cấp dở. Dashboard lấy tối đa 100 lệnh/cảnh báo gần nhất; audit 200; telemetry 2.000 bản ghi/truy vấn.

Tài liệu: [Mongoose](https://mongoosejs.com/docs/connections.html), [connect-mongo](https://github.com/jdesboeufs/connect-mongo), [MongoDB Atlas](https://www.mongodb.com/docs/atlas/driver-connection/), [Express](https://expressjs.com/en/5x/api/), [Tailwind](https://tailwindcss.com/docs/installation/tailwind-cli).

Base có hỗ trợ AI. Nhóm cần kiểm chứng và tự giải thích khi bảo vệ; ghi nhận thư viện/tài nguyên bên thứ ba theo đề môn học.
