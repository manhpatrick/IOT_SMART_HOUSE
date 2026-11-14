# Rà soát esp32_sensor.ino — 14/11/2026

Nguồn: file `esp32_sensor.ino` nhóm cung cấp từ Downloads. Đây là firmware Arduino C++ cho **một ESP32** có DHT11, MQ-2, LDR, LED, relay/quạt và còi. Mã là bản nền đã nhập, **chưa tương thích MQTT với backend NODO hiện tại**. Chưa compile hoặc nạp/thử trên board; máy không tìm thấy arduino-cli/PlatformIO. File gốc trong Downloads không bị thay đổi.

**Cập nhật BE/FE:** đã hỗ trợ readings.gasRaw tùy chọn trên climate, ngưỡng gasThreshold/gasClearThreshold, cảnh báo gas và lệnh buzzer có ACK. Xem [GAS-ALARM](../docs/GAS-ALARM.md). Firmware bên dưới vẫn legacy chưa đổi transport. Các ghi chú ban đầu “BE chưa có gas” cần đọc theo cập nhật này; profile LDR/LED gộp vẫn chưa có.

## Đã làm trong lần nhập

- Đặt sketch tại `esp32_sensor/esp32_sensor.ino`, thư mục trùng tên theo cách mở Arduino IDE.
- Tách thông tin Wi-Fi/broker/credential/topic sang `secrets.h` local được Git ignore. Có `secrets.example.h` để thành viên tạo cấu hình riêng; không đưa mật khẩu thật lên Git.
- Chặn trường `device` thiếu và `state` sai trước khi strcmp/đổi chế độ; tránh truy cập con trỏ null hoặc lệnh không hợp lệ tự đưa về Manual.
- Tăng buffer PubSubClient lên 1024 byte cho bước phát triển tiếp. Đây không phải cam kết toàn bộ protocol mới đã được triển khai.
- Giữ logic phần cứng/Auto cũ để nhóm đối chiếu; không tự xác nhận mạch hoạt động hay thay đổi chính sách còi gas.

## Các điểm phải sửa trước khi ghép NODO

| Ưu tiên | Firmware nhập hiện tại | NODO đang yêu cầu / việc cần làm |
| --- | --- | --- |
| P0 | ID cũ có dấu gạch dưới | Dùng đúng Device ID đã provision, ví dụ `hw-climate-01`; API đăng ký hiện chỉ chấp nhận chữ thường/số/dấu gạch ngang |
| P0 | `devices/.../commands`, các topic cũ | `smartroom/{id}/telemetry`, `status`, `command` (số ít), `config`, `ack` |
| P0 | Username=ID, password là token cố định cũ | Dùng username/password/clientId do web cấp trên broker thật; không dùng tài khoản backend/admin. Board dùng IP LAN laptop và cổng lab 1884, không dùng localhost/host.docker.internal |
| P0 | Telemetry `device_id,temp,hum,gas,light,...` | JSON `deviceId,bootId,seq,timestamp,readings,state`; NTP + UTC ISO, seq tăng trong một boot, bootId đổi mỗi boot |
| P0 | Status `{"status":"online"}`; chỉ gửi lúc connect | Status `{"online":true,"firmware":"...","fault":null}` định kỳ 10 giây; LWT `{"online":false}`. Chỉ clear fault sau phục hồi thật |
| P0 | Nhận lệnh `{device,state}` | Đọc envelope commandId/deviceId/kind/payload/expiresAt; actuator và value boolean. Không tự đổi MANUAL khi nhận gói lỗi |
| P0 | Không gửi ACK | Publish ACK cùng commandId sau áp dụng, failed nếu từ chối; kiểm tra thời hạn, đúng device ID và chống thực hiện trùng QoS 1 |
| P0 | Config `lightThresh,gasThresh,tempThresh,autoMode` | Khớp mode AUTO/MANUAL và ngưỡng BE. Climate hiện dùng fanOn/fanOff/temperatureAlert, lighting dùng lightOn/lightOff; combined profile chưa có |
| P0 | Một payload có DHT + gas + ánh sáng | Backend hiện **không có gas** và không cho lightPercent trong climate. Cần mở rộng đồng bộ profile/schema/model/API/UI cho một node đa cảm biến, hoặc chọn giai đoạn đầu chỉ nối phần climate. Không tạo hai ID cho một ESP32 để giả hai node |
| P1 | DHT đọc lỗi thì vẫn gửi 0 ban đầu hoặc giá trị cũ như mới | Theo dõi valid/age, phát fault, không gán timestamp mới cho số đo cũ. DHT11 đọc 2 giây nhưng publish 1,5 giây tạo bản lặp không có số đo mới |
| P1 | while chờ Wi-Fi/MQTT + delay | Retry theo millis, có timeout; vẫn chạy vòng đọc/Auto/còi khi server/broker mất. PubSubClient connect còn có thể block theo socket timeout, cần cấu hình và đo độ trễ |
| P1 | Quạt/LED dùng một ngưỡng | Hysteresis bật/tắt để tránh chập chờn quanh ngưỡng; validate cấu hình trước khi áp dụng |
| P1 | Ngưỡng/mode/decommission chỉ lưu RAM | Lưu ngưỡng/mode trong NVS khi thay đổi. Cờ decommission reset sau reboot nên chưa phải khóa vĩnh viễn; khóa kết nối chính do broker/BE. BE hiện không phát config.decommission, không dựa vào nhánh này để demo thu hồi |
| P1 | Còi chỉ do gas quyết định, không có manual buzzer | Chốt với phần cứng cách phối hợp còi gas, cảnh báo nhiệt và manual; ACK/reported state phải phản ánh đầu ra đã áp dụng, không báo tắt nếu logic gas vẫn đang bật |

## Phạm vi đa cảm biến cần chốt

Mạch trong file nhiều chức năng hơn profile climate hiện tại của web. Muốn hiển thị đủ trên **một node**, hướng mở rộng là profile combined/environment có nhiệt độ, độ ẩm, lightPercent và gasRaw, đầu ra fan/light/buzzer. Tên này là đề xuất, chưa có trong code. Cần thêm gasThreshold, ngưỡng đèn và cảnh báo gas ở BE/UI; không chỉ sửa tên key trong firmware rồi mong server chấp nhận.

MQ-2 hiện là ADC raw 0–4095, chưa phải ppm hay kết luận nồng độ gas an toàn. LDR là giá trị đảo từ ADC; có thể quy đổi lightPercent 0–100 với chiều sáng đã kiểm chứng, chưa phải lux. Định nghĩa và ngưỡng phải ghi rõ trong báo cáo. Cần nhóm xác nhận model board, điện áp AO cảm biến và relay active-high theo đấu dây thực, không suy ra chỉ từ comment.

## Build và thực nghiệm còn thiếu

Mở `esp32_sensor/esp32_sensor.ino` trong Arduino IDE. Cần board package ESP32, PubSubClient, ArduinoJson và DHT sensor library tương ứng code `DHT.h`; ghi chính xác tác giả/phiên bản sau khi compile thành công. Sketch đang dùng API StaticJsonDocument, cần kiểm tra tương thích phiên bản ArduinoJson chọn. Không bịa phiên bản đã kiểm chứng.

Sau khi sửa protocol, test lần lượt: DHT/analog/relay riêng → Wi-Fi/NTP → MQTT credential/topics → số đo/heartbeat → config Manual + ACK → lệnh fan/light/buzzer + ACK → Auto/hysteresis → rút mạng/mất broker → cảm biến lỗi → reset giữ config → khóa node tại broker. Video phải có số đo và actuator thật; MQTTX chỉ kiểm tra giao thức.

Không có buffer telemetry offline/đồng bộ bù trong bản này; không có OTA. Không cần firmware vào container Express. Dừng MQTTX đang dùng cùng clientId khi chạy ESP32 thật để tránh hai client đá nhau.

PubSubClient chỉ publish QoS 0, có thể subscribe QoS 0/1. Tham số QoS 1 trong LWT connect không biến telemetry/ACK publish thành QoS 1. Nếu yêu cầu publisher QoS 1 thì phải chọn thư viện hỗ trợ, hoặc ghi rõ giới hạn này và đo mất bản tin; application ACK vẫn phải tự triển khai. Xem [README chính thức](https://github.com/knolleary/pubsubclient#limitations).

Tham khảo: [MQTT contract NODO](../docs/MQTT-CONTRACT.md), [PubSubClient: publish QoS 0, subscribe QoS 0/1](https://pubsubclient.knolleary.net/), [Preferences/NVS](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/preferences.html), [ADC raw ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html).
