# Hệ thống IoT thông minh — NODO Admin

Quản lý nhiều nhà → nhiều phòng → nhiều node. **Admin** giám sát hệ thống, quản lý tài khoản/vòng đời thiết bị. **Operator là chủ nhà**, tự quản lý phòng, nhận thiết bị, chỉnh ngưỡng và mời viewer. **Viewer** chỉ xem các nhà đã tham gia. Hai profile ESP32: **môi trường (DHT11/DHT22, quạt/còi)** và **ánh sáng (LDR, LED)**.

Giao diện admin tại `/`; operator/viewer tại **`/app`**, tối ưu điện thoại và có thể cài dạng PWA. Hướng dẫn [nhà/phòng, phân quyền, nhận thiết bị, app và triển khai HTTPS](docs/HOMES-AND-MOBILE.md); bảng [xử lý lỗi/mất kết nối/dữ liệu cũ](docs/FAILURE-HANDLING.md). **Trạng thái bàn giao và việc còn thiếu:** [CURRENT-STATUS.md](docs/CURRENT-STATUS.md).

**Express 5 + MongoDB/Mongoose + HTML/JavaScript + Tailwind 4 + MQTT + WebSocket.** User, thiết bị, telemetry, lệnh, cảnh báo, audit và session đều lưu trong MongoDB. Khi `DEMO_MODE=true`, hai node được giả lập, dữ liệu vẫn lưu vào MongoDB thật.

## Kiến trúc

```mermaid
flowchart LR
  ESP[ESP32 thật: firmware + cảm biến + đầu ra] <-->|MQTT| Broker[MQTT broker bên ngoài]
  Broker <-->|MQTT| App[Express + AI worker]
  App <--> DB[(MongoDB)]
  Browser[Web admin / PWA operator và viewer] <-->|HTTPS / WebSocket| Proxy[Caddy]
  Proxy <--> App
```

Bản Docker HTTPS chứa App/Caddy và dùng Atlas/broker bên ngoài. Bản Docker local demo chứa App/MongoDB, truy cập HTTP trực tiếp, dùng simulator thay phần cứng. Đây là kiến trúc phần mềm; firmware/mạch thật còn cần bàn giao.

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

## Cấu trúc nộp đồ án

Các thư mục được tách theo yêu cầu đề bài. `package.json`, lockfile và `.env` đặt ở gốc; vẫn chạy `npm run dev` tại gốc repo. Backend giữ cách chia controller/routes/services đã dùng trước đây.

```text
iot-admin/
├── README.md                    Tổng quan, cách chạy và trạng thái bàn giao
├── firmware/                    Firmware ESP32 nền + review; chưa khớp BE
├── backend/
│   ├── config/env.js            Đọc cấu hình môi trường
│   ├── src/server.js            Entry point
│   ├── src/app.js               Express, session, API, WebSocket, static FE
│   ├── src/ai/                  Elman RNN, circular KDE, worker huấn luyện
│   ├── src/controller/          Xử lý HTTP request
│   ├── src/routes/              Định tuyến API
│   ├── src/middleware/          Auth, phân quyền, CSRF, lỗi
│   ├── src/services/            MQTT, IoT, AI, nhà/phòng, session, audit
│   ├── src/validation/          Schema dữ liệu API/MQTT
│   ├── src/utils/               Defaults, khóa trong process, HTTP errors
│   └── scripts/                 In gói MQTT mẫu, thực nghiệm AI synthetic
├── frontend/
│   ├── styles.css               Nguồn Tailwind
│   └── public/                  HTML, assets, manifest, service worker
├── database/
│   ├── models/                  Schema Mongoose và index
│   ├── mongodb.js               Kết nối và khởi tạo collection/index
│   ├── seed-data.js             Bootstrap, dữ liệu demo khi được bật
│   ├── check-connection.js      Kiểm tra DB, không in mật khẩu
│   └── migrate-sqlite.js        Migration từ SQLite cũ, đọc nguồn read-only
├── deployment/                  Dockerfile, Compose local/HTTPS, mẫu broker
├── hardware/                    Checklist BOM/wiring; CHƯA có sơ đồ thật
├── tests/                       API, AI, migration, browser desktop/mobile
├── docs/                        Hướng dẫn, đối chiếu yêu cầu, kết quả AI
├── .vscode/                     Task chạy dự án
├── .env                         URI/secret local, được Git bỏ qua
└── .env.example                 Mẫu cấu hình trong repository
```

Luồng BE: **Route → Middleware → Controller → Service/Model → MongoDB**. Express phục vụ `frontend/public/`; đường dẫn trên trình duyệt vẫn là `/`, `/app`, `/assets/...`. Không có server frontend thứ hai. Việc đổi thư mục không đổi database, ID hay API.

Startup bổ sung nhà/phòng cho node cũ theo owner/location, giữ dữ liệu cũ; viewer chuyển sang phạm vi toàn nhà. Xem migration trong HOMES-AND-MOBILE trước khi dùng dữ liệu thật. Xem [bảng đối chiếu yêu cầu và phần còn thiếu](docs/REQUIREMENTS-STATUS.md).

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

AI đã có panel **AI & bảo mật** trên admin và `/app#ai`: RNN cảm biến huấn luyện trong Node worker, circular KDE phát hiện giờ đăng nhập khác thói quen, lịch sử/cảnh báo riêng cho tài khoản. [Hướng dẫn dữ liệu, huấn luyện, đánh giá và Docker/firmware](docs/AI-GUIDE.md). Chạy `npm.cmd run ai:demo` để tạo báo cáo synthetic riêng, không ghi vào Atlas/tài khoản thật.

- Dashboard realtime, biểu đồ, online/offline, cảnh báo và hoạt động.
- User Admin/Operator/Viewer, khóa tài khoản, đổi mật khẩu, thu hồi phiên.
- Registered → Provisioned → Active, Maintenance/Locked/Decommissioned, lịch sử vòng đời.
- Nhà/phòng, quyền thành viên theo từng nhà; mã nhận node riêng, lời mời viewer gắn email, hết hạn và thu hồi.
- Telemetry đúng profile/range/timestamp; chống trùng bằng index `(device_id, boot_id, seq)`.
- Auto/Manual, cấu hình ngưỡng, quạt/còi/đèn; pending/applied/failed/timeout/cancelled.
- ACK đúng node và còn hạn; một lệnh pending cho mỗi node bằng unique partial index.
- Cảnh báo nhiệt độ/offline/stale/fault; xác nhận riêng với hết bất thường; CSV, audit lọc theo nhà và retention.
- Cookie HttpOnly/SameSite, CSRF, rate limit login, validate chặn MongoDB selector injection.
- Session MongoDB bằng connect-mongo; TTL index xóa phiên hết hạn.

Xem [nhà/phòng và app](docs/HOMES-AND-MOBILE.md), [xử lý lỗi](docs/FAILURE-HANDLING.md), [ADMIN-CHECKLIST.md](docs/ADMIN-CHECKLIST.md), [API.md](docs/API.md) và [MQTT-CONTRACT.md](docs/MQTT-CONTRACT.md).

## Nối ESP32 thật

Phạm vi demo dự kiến dùng **một ESP32 thật**. Mục 4.2 đề bài yêu cầu ít nhất một thiết bị vật lý; hai node với nhóm bốn người là **khuyến nghị**, không phải bắt buộc. Đã nhận [firmware nền DHT11 + MQ-2 + LDR](firmware/README.md); giao thức còn khác BE và chưa có bằng chứng compile/board thật. Xem [review và các phần cần sửa](firmware/REVIEW.md). [Ba hướng nâng cao Docker, AI và realtime](docs/ADVANCED-DIRECTIONS.md); implementation AI hiện tại là Elman RNN, không phải LSTM. Profile gộp nhiều cảm biến/đầu ra trên một ESP32 cần mở rộng đồng bộ, hiện chưa có trong backend.

Bàn giao cho hai bạn phần cứng: [hướng dẫn kết nối, broker và firmware](docs/HARDWARE-INTEGRATION.md), [40 kịch bản thử nghiệm](docs/TEST-PLAN.md), [JSON/topic MQTT](docs/MQTT-CONTRACT.md). Có mẫu `deployment/mosquitto-lab.conf.example` và script `npm.cmd run mqtt:sample -- hw-climate-01 climate` để in gói thử có timestamp hiện tại.

`DEMO_MODE=false`; cấu hình MQTT_URL, MQTT_USERNAME, MQTT_PASSWORD, MQTT_DYNAMIC_SECURITY. Dùng Mosquitto TLS và ACL riêng mỗi node. Adapter có cấp role/client và thu hồi kết nối bằng Dynamic Security; phần broker/ESP32 thật vẫn cần kiểm thử như trong MQTT contract. Quy tắc Auto chạy ở ESP32; backend lưu/gửi cấu hình và chỉ áp dụng khi nhận ACK.

## Kiểm thử

```powershell
npm.cmd test
npm.cmd run test:ui
npm.cmd run test:home-ui
npm.cmd run test:ai-ui
npm.cmd run ai:demo
```

Test khởi động **mongod thật trong database tạm bằng mongodb-memory-server**, không dùng hay ghi vào Atlas của bạn. Lần đầu package có thể tải binary MongoDB. API test kiểm tra phân quyền, session/TTL, lifecycle, duplicate, command race, ACK/timeout và dữ liệu/session sau restart. Migration test kiểm tra file SQLite read-only và chạy lại không trùng. Browser QA kiểm tra các màn và luồng thao tác trên desktop/mobile, ảnh ở `.artifacts/`.

Khi sửa frontend: `npm.cmd run build` hoặc `npm.cmd run css:watch`. Node watch tự khởi động lại BE khi thay đổi mã phụ thuộc; sau khi sửa `.env`, khởi động lại task dev để nạp cấu hình mới.

## Docker

Cấu hình và quy trình xác minh: [deployment/README.md](deployment/README.md). Chạy demo phần mềm bằng MongoDB trong container riêng, không cần sửa `.env` Atlas:

```powershell
docker compose -f deployment/compose.local.yaml up -d --build
docker compose -f deployment/compose.local.yaml ps
```

Mở `http://127.0.0.1:3080`. Đây là dữ liệu mô phỏng; cần dừng server dev đang chiếm port 3080 trước. Có thể dùng `npm run docker:up` để khởi động và in URL, `npm run docker:build` để build lại. Docker local đã build/chạy và healthcheck thành công; bản HTTPS chưa triển khai ra Internet. Firmware chạy trên ESP32, không cần đưa vào image server.

Để thử MQTT thật bằng MQTTX và Mosquitto ngoài Docker (lab 1884):

```powershell
Copy-Item .env.mqtt-lab.example .env.mqtt-lab
# Điền mật khẩu nodo-backend trong .env.mqtt-lab, giữ broker đang chạy.
npm.cmd run docker:mqtt
```

Chỉ copy mẫu lần đầu; giữ file local đã có. Khi sửa code trong chế độ MQTT, dùng `npm run docker:mqtt:build`. Lệnh `docker:up`/`docker:build` dùng chế độ mô phỏng. Xem [hướng dẫn broker và MQTT lab](deployment/README.md).

## Giới hạn và triển khai

Đây là base chạy một tiến trình Node. Atlas chưa được coi là kết nối thành công nếu chỉ có test database tạm; cần `npm run db:check` với URI thật. Thiết lập HTTPS, secret riêng, DB user chỉ được readWrite database cần dùng, backup/restore và monitoring trước khi triển khai. Chỉ bật TRUST_PROXY=1 sau đúng một proxy đáng tin cậy.

AI đã có code và thử nghiệm synthetic; chưa có đánh giá dữ liệu ESP32/người dùng thật. Chưa có OTA, email/Telegram/push khi đóng app, quên mật khẩu, MFA, rotate credential hoặc phân trang toàn bộ lịch sử. Cấp quyền nhiều bước tại Mosquitto chưa có transaction phân tán; nếu gián đoạn phải kiểm tra role/client đã cấp dở. Dashboard lấy tối đa 100 lệnh/cảnh báo gần nhất; audit 200; telemetry 2.000 bản ghi/truy vấn.

Tài liệu: [Mongoose](https://mongoosejs.com/docs/connections.html), [connect-mongo](https://github.com/jdesboeufs/connect-mongo), [MongoDB Atlas](https://www.mongodb.com/docs/atlas/driver-connection/), [Express](https://expressjs.com/en/5x/api/), [Tailwind](https://tailwindcss.com/docs/installation/tailwind-cli).

Base có hỗ trợ AI. Nhóm cần kiểm chứng và tự giải thích khi bảo vệ; ghi nhận thư viện/tài nguyên bên thứ ba theo đề môn học.
