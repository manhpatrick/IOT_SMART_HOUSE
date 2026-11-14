# Trạng thái bàn giao và việc cần hoàn thiện

Cập nhật **14/11/2026**, phạm vi demo **một ESP32 vật lý**. Tài liệu này là trạng thái hiện tại; các bảng kết quả theo ngày trong VALIDATION.md giữ lại lịch sử kiểm tra.

**Bổ sung gas:** BE/FE đã nhận gasRaw tùy chọn trên climate, lưu ADC/CSV, hiển thị gas, cấu hình ngưỡng và tạo cảnh báo/lệnh còi cả Auto/Manual với ACK/timeout/hysteresis. Chi tiết [GAS-ALARM](GAS-ALARM.md). Firmware legacy vẫn cần sửa giao thức trước khi còi vật lý nhận lệnh; profile gộp LDR/LED chưa hoàn thành.

## Đã có

- Repo chia firmware/backend/frontend/database/deployment/hardware/tests/docs; npm và lockfile ở gốc.
- Web admin và PWA operator/viewer; nhà/phòng, claim thiết bị, mời viewer và phân quyền theo nhà.
- MongoDB/session, password hash, CSRF, lifecycle, cấu hình/lệnh có ACK/timeout; telemetry validation/dedup, cảnh báo/audit/CSV.
- RNN cảm biến và KDE giờ đăng nhập, worker training, kết quả/đánh giá trên UI; report synthetic có nguồn và giới hạn rõ.
- Telemetry có metric cards, bộ lọc, biểu đồ tách node, bảng 25/50 dòng, hiệu ứng mới và xử lý CSS/cache.
- Docker local build/runtime đã chạy; app/MongoDB healthy. Mosquitto Dynamic Security chạy ngoài Docker ở cổng lab 1884; BE đã kết nối và số đo MQTTX đã xuất hiện trên web.
- Firmware nền đã nhập, tách secrets, sửa guard lệnh lỗi và ghi GPIO theo code. **Chưa tương thích giao thức BE và chưa compile/flash/test board.**

## Thiếu ở firmware/phần cứng

| Mức | Việc cần làm | Vì sao |
| --- | --- | --- |
| P0 | Đổi topic, ID, credential và JSON theo MQTT-CONTRACT | Firmware còn dùng devices/.../commands và trường temp/hum/... nên BE chưa nhận |
| P0 | Timestamp UTC/NTP, bootId/seq, heartbeat 10 giây và LWT đúng JSON | Theo dõi dữ liệu cũ/online và chống trùng |
| P0 | Đọc envelope command/config, check deviceId/expiresAt, chống trùng commandId và trả ACK | Chứng minh thực hiện lệnh/cấu hình hai chiều |
| P0 | Chốt mạch một node DHT11 + MQ-2 + LDR + LED/quạt/còi với profile gộp ở BE | Chưa có profile nhận đủ các cảm biến/đầu ra trên một node |
| P1 | Retry Wi-Fi/MQTT không chặn Auto; xử lý DHT lỗi/giá trị cũ | Mất broker không được dừng chức năng local hoặc hiển thị số đo giả |
| P1 | Hysteresis, lưu mode/ngưỡng NVS, quy tắc còi gas/manual | Tránh chập chờn, mất config sau reset và state/ACK sai đầu ra thực |
| P1 | Compile/flash, chốt phiên bản thư viện/board package, BOM/wiring/nguồn/ảnh | Hiện mới có code và GPIO theo mã, chưa có bằng chứng mạch |

Chi tiết: [firmware/REVIEW](../firmware/REVIEW.md), [PINOUT](../hardware/PINOUT.md). MQ-2 đang là ADC raw, chưa phải ppm; LDR chưa phải lux. Không dùng đơn vị đã hiệu chuẩn khi chưa có thực nghiệm tương ứng.

## Thiếu ở backend/frontend/triển khai

| Mức | Việc cần làm | Trạng thái |
| --- | --- | --- |
| P0 | Profile gộp: temperature/humidity/lightPercent/gasRaw, fan/light/buzzer | Chưa có; cần sửa đồng bộ schema/model/defaults/validation/ingest/config/commands/FE/alerts/tests |
| P0 | Ngưỡng đèn trên node gộp | Gas đã có trên climate; LDR/LED gộp và quy tắc đèn trên cùng node vẫn chưa có |
| P1 | Test MQTT hai chiều: config/Manual/ACK/timeout, khóa node, sai topic; ghép ESP32 thật | Đã thấy kết nối và số đo MQTTX; chưa đủ bằng chứng ACK/ACL/board toàn luồng |
| P1 | Phân biệt retained online cũ với heartbeat mới | Điểm R18 trong TEST-PLAN còn cần xử lý/kiểm chứng |
| P1 | HTTPS, MQTT/TLS, điện thoại từ xa và phục hồi container/DB/model | Docker local đã chạy; chưa hoàn tất triển khai công khai, backup/restore và persistence đầu cuối |
| P1 | Dữ liệu thực có nhãn, đánh giá AI và latency/reconnect/mất gói/ổn định | Synthetic và test phần mềm chưa thay được dữ liệu ESP32 thật |

Voice mới là đề xuất, **chưa có code**. OTA, email/push khi đóng app, quên mật khẩu, MFA, CI/CD và monitoring tập trung chưa có; không phải tất cả đều bắt buộc. Chưa có buffer firmware đồng bộ bù khi mất mạng. Base chạy một process BE, chưa có điều phối khóa/job nhiều replica. Bảng telemetry phân trang trong dữ liệu đã tải, chưa phân trang toàn bộ DB.

## Còn thiếu để nộp bài

Bộ sơ đồ thiết kế thống nhất, threat model/ma trận quyền, báo cáo/slide, bảng đóng góp, ảnh/video thực nghiệm, số liệu đo và demo trực tiếp. Tag/release cuối nên chốt sau ghép board và kiểm thử. Một ESP32 đáp ứng mức thiết bị tối thiểu của đề; hai node cho nhóm bốn người là khuyến nghị.

## Chạy trên máy thành viên

1. Clone repo; Node 24+, `npm ci`. Chạy Node với Atlas thì copy `.env.example` thành `.env`, điền URI/secret riêng. Không copy đè secret local đã có.
2. Demo giao diện độc lập Atlas: mở Docker Desktop rồi `npm run docker:build`. Database/tài khoản/số đo là demo riêng.
3. MQTT lab: cấu hình Mosquitto Dynamic Security theo HARDWARE-INTEGRATION, cổng 1884, tạo account BE. Copy `.env.mqtt-lab.example` thành `.env.mqtt-lab`, điền mật khẩu BE; `npm run docker:mqtt:build`.
4. Admin tạo ID node mới, provision và kích hoạt. MQTTX dùng credential riêng của node, đúng clientId. Dừng MQTTX cùng clientId trước khi nối ESP32.
5. Firmware hiện là bản legacy cần sửa trước; secrets thật ở secrets.h local, không đưa lên Git. Hướng dẫn/test tại firmware/README và docs/TEST-PLAN.
