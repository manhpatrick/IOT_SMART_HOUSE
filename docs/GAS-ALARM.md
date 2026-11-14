# Gas MQ-2 và còi báo động

Hỗ trợ trên **một node climate**: DHT nhiệt độ/độ ẩm, gasRaw và lightPercent trên cùng ESP32; có quạt/còi/đèn. Xem [ONE-NODE-MULTISENSOR](ONE-NODE-MULTISENSOR.md). Gas là ADC thô 0–4095, chưa phải ppm và chưa phải thiết bị báo gas được chứng nhận.

## Dữ liệu và ngưỡng

Firmware/MQTTX publish vào `smartroom/hw-climate-01/telemetry`, đúng envelope hiện có:

```json
{
  "deviceId": "hw-climate-01",
  "bootId": "boot-lab-01",
  "seq": 1,
  "timestamp": "REPLACE_WITH_CURRENT_UTC_ISO_TIMESTAMP",
  "readings": {"temperature": 29.2, "humidity": 65.1, "gasRaw": 1600},
  "state": {"fan": false, "buzzer": false, "mode": "AUTO"}
}
```

Thay timestamp bằng giờ thực, tăng seq mỗi lần gửi. `gasRaw` phải là số nguyên 0–4095; không gửi NaN, không gửi 0 để thay số đo lỗi. Không có gasRaw thì giữ cảnh báo cũ, không coi là hết gas. Gói cũ chỉ lưu lịch sử; không đổi cảnh báo hiện tại.

Để tạo JSON mới cho MQTTX: `npm run mqtt:sample -- hw-climate-01 climate 1600` (báo động), hoặc thay 1600 bằng 900 để thử kết thúc. Lệnh chỉ in JSON, không tự gửi MQTT; copy phần JSON vào topic telemetry của node. Trong 15 giây sau khi nhận command, gửi ACK đúng commandId và state.buzzer tương ứng. Không chạy MQTTX cùng clientId với board thật.

Admin hoặc chủ nhà mở cấu hình node để chỉnh `gasThreshold` (mặc định 1200) và `gasClearThreshold` (1000). Yêu cầu 0 ≤ clear < alarm ≤ 4095. Ngưỡng chỉ được lưu áp dụng sau ACK cấu hình; config cũ chưa có gas dùng mặc định, cập nhật config không gửi trường gas sẽ giữ ngưỡng đã xác nhận.

## Cảnh báo và điều khiển

- Số đo mới ≥ gasThreshold mở Alert kind gas, severity critical. Khi đang cảnh báo, giá trị trong khoảng giữa hai ngưỡng vẫn giữ cảnh báo; mới ≤ gasClearThreshold thì resolve.
- Không tạo cảnh báo lặp khi đợt hiện tại còn open/acknowledged. Xác nhận cảnh báo không tắt còi hoặc kết thúc đợt.
- Chu kỳ rule BE khoảng 1 giây gửi lệnh actuator buzzer=true, source gas_rule, cả Auto/Manual; không đổi mode. Chỉ gửi khi node active/online, broker kết nối, gas còn mới và không có command pending. Một node vẫn chỉ có một lệnh chờ; lệnh rule không preempt lệnh trước.
- Còi chỉ hiển thị bật theo reported state/ACK từ node; không tự sửa state khi vừa publish. ACK gas phải có state.buzzer đúng giá trị yêu cầu; thiếu/sai sẽ failed. Timeout vẫn 15 giây; rule thử lại tối đa một lần/30 giây cho cùng giá trị, không flood broker.
- Cấm yêu cầu manual tắt buzzer khi gas_alarm_active=true, kể cả sau khi đã xác nhận alert.
- Khi gas đã xuống thấp, BE chỉ gửi tắt nếu rule gas từng bật còi, số đo gas/nhiệt độ còn mới, không có fault và nhiệt độ dưới ngưỡng cảnh báo. Không tự tắt còi vốn đã bật trước đợt gas. ACK tắt thành công mới giải phóng quyền điều khiển của rule.
- Offline/stale không tự đóng cảnh báo hoặc gửi lệnh tắt. Với thiết bị chưa hỗ trợ giao thức, rule có thể pending/timeout; không diễn giải thành còi vật lý đã kêu.

## Giao diện và dữ liệu

Admin Thiết bị/Chi tiết và Home điện thoại có panel gas, ADC, ngưỡng, thời điểm đo, cảnh báo và trạng thái còi xác nhận. Viewer chỉ xem; không thay ngưỡng/gửi lệnh. Trang Dữ liệu cảm biến thêm card/cột/series gas khi đã nhận dữ liệu, trục riêng 0–4095; CSV có gas_raw. Model RNN hiện vẫn chỉ dùng nhiệt độ/độ ẩm, không gọi rule gas là AI.

## Phần firmware còn cần làm

Firmware đã nhập vẫn dùng topic/JSON legacy, chưa nhận envelope/ACK mới, nên chưa cắm board là kêu theo lệnh server. Nhóm phải sửa transport, heartbeat/NTP/seq, nhận payload actuator buzzer và ACK state.buzzer sau áp dụng. Cần thực hiện **quy tắc còi gas ngay trên ESP32** để vẫn báo khi mất Wi-Fi/BE; phối hợp ngưỡng đã lưu, báo nhiệt và manual. Backend rule là lớp hỗ trợ, không thay thế xử lý local hoặc kiểm chứng mạch.

PubSubClient hiện publish QoS 0; ghi rõ giới hạn và kiểm thử. Không đo ppm từ ADC nếu chưa hiệu chuẩn. Không kích thích gas nguy hiểm để demo; MQTTX kiểm tra giao thức bằng số giả.

Kiểm thử: `npm test` gồm gas.test.js; `npm run test:gas-ui` kiểm tra ngưỡng, telemetry, Home mobile và viewer. Dùng `npm run docker:mqtt:build` để cập nhật container ở chế độ MQTT sau thay đổi code.
