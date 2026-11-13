# Firmware ESP32 — phần cần nhóm phần cứng bàn giao

**Đã nhận firmware nền:** [esp32_sensor/esp32_sensor.ino](esp32_sensor/esp32_sensor.ino), cho một ESP32 đọc DHT11 + MQ-2 + LDR, điều khiển LED/quạt/còi. Đây là bản dùng topic/JSON cũ, **chưa ghép được backend NODO và chưa compile/nạp board trong lần rà soát này**. Xem [REVIEW.md](REVIEW.md) cho các chỗ lệch giao thức và lộ trình hoàn thiện. GPIO theo mã tại [hardware/PINOUT.md](../hardware/PINOUT.md), chưa xác nhận mạch thực.

Thông tin kết nối của file nguồn được chuyển sang `esp32_sensor/secrets.h` local (Git ignore). Thành viên clone repo cần copy `secrets.example.h` thành `secrets.h` và điền thông tin của mình. File mẫu giữ giao thức legacy để đối chiếu, không phải bản cấu hình NODO hoàn chỉnh. Không commit secrets.h.

## Nội dung cần bổ sung

- Mã nguồn nạp vào board, entry point `setup()`/`loop()` hoặc tương đương.
- `platformio.ini` nếu dùng PlatformIO; nếu dùng Arduino IDE, ghi phiên bản ESP32 board package, thư viện và board target trong README.
- File cấu hình mẫu cho Wi-Fi, device ID, broker, topic, MQTT credential và CA nếu dùng TLS; không commit mật khẩu thật.
- Hướng dẫn compile/flash, Serial baud và kết quả compile với phiên bản công cụ đã dùng.
- GPIO mapping khớp sơ đồ trong `../hardware/`; cách thử cảm biến/actuator riêng trước khi nối backend.

## Hợp đồng với phần mềm

Đọc [MQTT-CONTRACT](../docs/MQTT-CONTRACT.md) và [HARDWARE-INTEGRATION](../docs/HARDWARE-INTEGRATION.md). Dùng đúng JSON hiện tại, không tự thêm key vào schema strict.

1. Kết nối Wi-Fi, đồng bộ giờ, tạo bootId mới mỗi lần boot; seq tăng trong cùng boot.
2. Kết nối broker bằng tài khoản riêng đã provision, subscribe command/config của đúng device ID.
3. Đọc DHT, gửi temperature/humidity và reported state; publish heartbeat, khai báo LWT. Không gửi NaN hay số đo giả khi cảm biến lỗi.
4. Nhận lệnh có commandId/expiresAt, kiểm tra hết hạn và chống thực hiện trùng; chỉ ACK applied sau khi xử lý thành công, gửi failed khi không làm được.
5. Auto dùng ngưỡng có hysteresis tại board; Manual điều khiển rõ true/false. Lưu cấu hình/mode trong NVS.
6. Reconnect và subscribe lại, báo fault khi lỗi, chỉ báo fault:null sau phục hồi thực sự. Xác định chính sách output khi reset/mất mạng.

Nếu chưa có buffer telemetry khi mất Wi-Fi thì ghi rõ **chưa hỗ trợ đồng bộ bù**; backend chấp nhận gói cũ không đồng nghĩa firmware đã có bộ đệm.

## Bằng chứng cần nộp

Ghi firmware version, board/chân, thời gian thử, log Serial đã che credential và video luồng cảm biến → MQTT → DB/web → lệnh → actuator/ACK. Theo [TEST-PLAN](../docs/TEST-PLAN.md), đánh dấu PASS/FAIL/N/A dựa trên thử thật. Một ESP32 gắn nhiều cảm biến vẫn là một node vật lý.

Docker server không cần firmware để build; bài nộp toàn hệ thống vẫn cần mã firmware này.
