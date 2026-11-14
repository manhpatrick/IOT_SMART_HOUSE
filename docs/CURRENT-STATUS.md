# Trạng thái bàn giao và việc cần hoàn thiện

Cập nhật **14/11/2026**, phạm vi demo **một ESP32 vật lý**. Tài liệu này là trạng thái hiện tại; các bảng kết quả theo ngày trong VALIDATION.md giữ lại lịch sử kiểm tra.

**Phạm vi giao diện mới:** chỉ web desktop cho admin/operator/viewer. Đã bỏ luồng cài app/PWA và thanh điều hướng điện thoại; worker/cache NODO cũ được gỡ để chuyển về web. Micro, điều khiển từ xa, phân quyền và xử lý mất kết nối vẫn giữ trên desktop. Nút Đăng xuất có chữ ở header, hủy session server và về trang đăng nhập. Các ca mobile/PWA trong tài liệu cũ không còn thuộc phạm vi nộp bài.

**Một node đa cảm biến:** BE/FE đã mở rộng climate nhận DHT + LDR + MQ-2 cùng Device ID, có ngưỡng ánh sáng và điều khiển fan/light/buzzer với ACK. Không cần đổi ID/xóa DB; payload DHT cũ vẫn tương thích. Xem [ONE-NODE-MULTISENSOR](ONE-NODE-MULTISENSOR.md) và [GAS-ALARM](GAS-ALARM.md). Firmware legacy vẫn cần sửa giao thức/compile/flash để đầu ra vật lý nhận lệnh.

## Đã có

**Điều khiển kết hợp:** UI bỏ toàn bộ lựa chọn/nhãn chế độ. Operator gửi actuator ngay cả config cũ AUTO; simulator chạy rule thường xuyên, lệnh tay giữ 5 phút theo output rồi trả về tự động. Nhiệt/gas ưu tiên, cấm tắt quạt/còi khi nhiệt đang cảnh báo và cấm tắt còi khi gas còn cảnh báo. BE lưu lease sau ACK và MQTT báo automaticEnabled/manualOverrideSeconds/safetyPriority. Firmware thật vẫn cần triển khai theo [HYBRID-CONTROL](HYBRID-CONTROL.md). Các mô tả chọn Manual mới điều khiển ở tài liệu cũ đã được thay bằng chính sách này.

**Bàn giao chỉ qua claim:** form admin đăng ký/sửa node không có owner/viewer/nhà/phòng. API đăng ký từ chối gán trực tiếp; API sửa chỉ nhận tên và vị trí kho (không đổi vị trí của node đã claim). Operator dùng mã nhận để xác lập nhà/chủ/phòng, mời viewer theo nhà. Admin không cấp quyền xem riêng từng thiết bị nữa; các trường legacy chỉ giữ để đọc/migrate dữ liệu cũ. Không thay đổi quyền sở hữu hiện có khi sửa thông tin thiết bị. Thông báo offline đã rút gọn, không suy đoán trạng thái Auto local.

**Tách web quản trị và web người dùng:** admin không còn workspace-switch/Mở NODO Home hoặc liên kết sang web operator. Trang Ngôi nhà có chủ nhà, email, số node/kết nối/lỗi và Chi tiết nhà (phòng, thiết bị, hoạt động) ngay trong console. Admin truy cập /app quay lại console. Operator/viewer vẫn có web desktop quản lý nhà, không phải mobile/PWA. Bàn giao gồm ba phần khác nhau: tài khoản web cho người dùng; credential MQTT cho firmware; mã claim một lần để operator nhận node vào nhà/phòng. Nhà 0/0 node là nhà chưa có thiết bị được gán/claim.

**AI login cập nhật theo yêu cầu mới:** bỏ sandbox và nút thử data mẫu. Docker local tự seed một lần 32 sự kiện/8 ngày cho từng operator/viewer (`AI_LOGIN_SEED=true`), kết hợp với login thực trong KDE. Bản ghi seed đánh dấu bootstrap, không ghi đè login thật; không nhân bản khi restart. Không có giảm trọng số riêng. UI rút gọn thẻ login/lịch sử, không hiện câu chờ 5 ngày. Phần mô tả sandbox cũ bên dưới chỉ là lịch sử thay đổi. Không tái tạo số đo/thiết bị giả đã xóa.

**Cấu hình và AI login mới:** trang Cài đặt chỉ còn cấu hình chung/độ cũ dữ liệu/trạng thái broker và số node, đã bỏ khối mật khẩu/ma trận quyền khỏi trang này. KDE login không bắt chờ 5 ngày: từ 6 mẫu giờ có thể đánh giá sơ bộ, một ngày dùng leave-one-slot-out. Nút Thử bằng dữ liệu mẫu minh họa KDE ngay, không đưa dữ liệu giả trở lại DB; lịch sử thật vẫn cần dữ liệu trước khi đánh giá cá nhân. Đổi mật khẩu của user vẫn nằm trong Cá nhân, API auth không bị xóa.

**Giao diện admin:** không còn trang/tab AI ở console hoặc Home; URL AI trực tiếp quay về tổng quan. Operator/viewer vẫn dùng AI theo quyền hiện có; không tắt engine AI. Card node có số đo nguồn demo được ghi nhãn và node offline có hướng dẫn kết nối/heartbeat. Có hồ sơ node trong DB không chứng minh có ESP32/MQTT client đang chạy. `docker:up` bật giả lập; `docker:mqtt` tắt giả lập và cần client thật hoặc MQTTX trả ACK.

**Quyền vận hành cập nhật:** admin giám sát nhiều nhà/node, quản lý tài khoản/vòng đời và cấu hình ngưỡng; không gửi actuator manual/voice hoặc đổi Auto/Manual. Chỉ operator có quyền quản lý nhà được điều khiển. Gas rule tự động vẫn là tác vụ hệ thống. Trang Dữ liệu cảm biến đưa bộ chọn lên đầu: Tất cả hiển thị bảng riêng từng ESP32 (nhà/phòng/ID/số đo/thời gian/trạng thái), chọn một node mới hiển thị các metric cards của node đó. Biểu đồ/lịch sử/CSV theo bộ chọn; số đo cũ không phải trạng thái hiện tại.

- Repo chia firmware/backend/frontend/database/deployment/hardware/tests/docs; npm và lockfile ở gốc.
- Web desktop admin/operator/viewer; nhà/phòng, claim thiết bị, mời viewer và phân quyền theo nhà.
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
| P0 | Chốt mạch một node DHT11 + MQ-2 + LDR + LED/quạt/còi | BE đã nhận chung trên climate; firmware phải map lightPercent/gasRaw và đầu ra đúng contract |
| P1 | Retry Wi-Fi/MQTT không chặn Auto; xử lý DHT lỗi/giá trị cũ | Mất broker không được dừng chức năng local hoặc hiển thị số đo giả |
| P1 | Hysteresis, lưu mode/ngưỡng NVS, quy tắc còi gas/manual | Tránh chập chờn, mất config sau reset và state/ACK sai đầu ra thực |
| P1 | Compile/flash, chốt phiên bản thư viện/board package, BOM/wiring/nguồn/ảnh | Hiện mới có code và GPIO theo mã, chưa có bằng chứng mạch |

Chi tiết: [firmware/REVIEW](../firmware/REVIEW.md), [PINOUT](../hardware/PINOUT.md). MQ-2 đang là ADC raw, chưa phải ppm; LDR chưa phải lux. Không dùng đơn vị đã hiệu chuẩn khi chưa có thực nghiệm tương ứng.

## Thiếu ở backend/frontend/triển khai

| Mức | Việc cần làm | Trạng thái |
| --- | --- | --- |
| P1 | Ghép node climate đa cảm biến với firmware thật | BE/FE/schema/config/commands/simulator đã có đủ ba nhóm; Auto vật lý và ACK phải kiểm chứng trên board |
| P1 | Test MQTT hai chiều: config/Manual/ACK/timeout, khóa node, sai topic; ghép ESP32 thật | Đã thấy kết nối và số đo MQTTX; chưa đủ bằng chứng ACK/ACL/board toàn luồng |
| P1 | Phân biệt retained online cũ với heartbeat mới | Điểm R18 trong TEST-PLAN còn cần xử lý/kiểm chứng |
| P1 | HTTPS, MQTT/TLS, điện thoại từ xa và phục hồi container/DB/model | Docker local đã chạy; chưa hoàn tất triển khai công khai, backup/restore và persistence đầu cuối |
| P1 | Dữ liệu thực có nhãn, đánh giá AI và latency/reconnect/mất gói/ổn định | Synthetic và test phần mềm chưa thay được dữ liệu ESP32 thật |

Đã có trang [Điều khiển từ xa và voice](REMOTE-CONTROL.md) tại /app#control, tách khỏi chỉnh ngưỡng cảm biến; cần thử micro thật trên điện thoại/HTTPS. OTA, email/push khi đóng app, quên mật khẩu, MFA, CI/CD và monitoring tập trung chưa có; không phải tất cả đều bắt buộc. Chưa có buffer firmware đồng bộ bù khi mất mạng. Base chạy một process BE, chưa có điều phối khóa/job nhiều replica. Bảng telemetry phân trang trong dữ liệu đã tải, chưa phân trang toàn bộ DB.

## Còn thiếu để nộp bài

Bộ sơ đồ thiết kế thống nhất, threat model/ma trận quyền, báo cáo/slide, bảng đóng góp, ảnh/video thực nghiệm, số liệu đo và demo trực tiếp. Tag/release cuối nên chốt sau ghép board và kiểm thử. Một ESP32 đáp ứng mức thiết bị tối thiểu của đề; hai node cho nhóm bốn người là khuyến nghị.

## Chạy trên máy thành viên

1. Clone repo; Node 24+, `npm ci`. Chạy Node với Atlas thì copy `.env.example` thành `.env`, điền URI/secret riêng. Không copy đè secret local đã có.
2. Demo giao diện độc lập Atlas: mở Docker Desktop rồi `npm run docker:build`. Database/tài khoản/số đo là demo riêng.
3. MQTT lab: cấu hình Mosquitto Dynamic Security theo HARDWARE-INTEGRATION, cổng 1884, tạo account BE. Copy `.env.mqtt-lab.example` thành `.env.mqtt-lab`, điền mật khẩu BE; `npm run docker:mqtt:build`.
4. Admin tạo ID node mới, provision và kích hoạt. MQTTX dùng credential riêng của node, đúng clientId. Dừng MQTTX cùng clientId trước khi nối ESP32.
5. Firmware hiện là bản legacy cần sửa trước; secrets thật ở secrets.h local, không đưa lên Git. Hướng dẫn/test tại firmware/README và docs/TEST-PLAN.
