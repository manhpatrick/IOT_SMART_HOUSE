# Một ESP32: DHT + LDR + MQ-2

Profile `climate` đã được mở rộng, không tạo thêm node/Device ID cho mỗi cảm biến. Một node thuộc một nhà và tối đa một phòng; mọi cảm biến nối với node dùng chung vị trí đó. Loại `lighting` riêng vẫn giữ để tương thích thiết bị chỉ có LDR/đèn.

| Nhóm cảm biến | JSON readings | Giá trị lưu DB | Đơn vị |
| --- | --- | --- | --- |
| DHT | temperature, humidity | temperature, humidity | °C, %RH |
| LDR | lightPercent | light_percent | % sáng tương đối 0–100; lớn hơn là sáng hơn |
| MQ-2 | gasRaw | gas_raw | ADC nguyên 0–4095; chưa phải ppm |

## Bản tin cho một node

Publish `smartroom/hw-climate-01/telemetry`:

```json
{
  "deviceId": "hw-climate-01",
  "bootId": "random-id-for-this-boot",
  "seq": 1,
  "timestamp": "REPLACE_WITH_CURRENT_UTC_ISO_TIMESTAMP",
  "readings": { "temperature": 29.2, "humidity": 65.1, "lightPercent": 28, "gasRaw": 650 },
  "state": { "fan": false, "light": true, "buzzer": false, "mode": "AUTO" }
}
```

`temperature`/`humidity` vẫn bắt buộc với climate. `lightPercent`/`gasRaw` tùy chọn để firmware DHT cũ không bị hỏng; board demo đủ ba cảm biến phải gửi đủ cả bốn chỉ số. Giá trị thiếu lưu null, không tự thay bằng 0. Bản tin có giá trị sai bị từ chối toàn bộ. Gas thiếu không tự xóa đợt cảnh báo gas cũ. Không gán timestamp mới cho số đo cũ hoặc số giả khi sensor lỗi.

Tạo JSON với timestamp hiện tại bằng `npm.cmd run mqtt:sample -- hw-climate-01 climate 650`. Lệnh chỉ in mẫu, không gửi MQTT. Thay số đo bằng dữ liệu thật nếu lấy bằng chứng phần cứng; bootId đổi mỗi lần boot, seq tăng mỗi bản tin. Không chạy MQTTX cùng clientId khi ESP32 đang kết nối.

LDR trong firmware nhập đang dùng `lightVal = 4095 - analogRead(PIN_LDR)`. Sau khi kiểm chứng chiều sáng đúng với mạch thực, có thể tính `lightPercent = lightVal * 100.0 / 4095.0`. Không gửi ADC 0–4095 vào trường phần trăm. MQ-2 vẫn gửi ADC raw nguyên; kiểm chứng chân analog/điện áp theo phần cứng thật.

## Cấu hình và đầu ra

```json
{
  "mode": "AUTO",
  "fanOn": 30,
  "fanOff": 28,
  "temperatureAlert": 35,
  "lightOn": 30,
  "lightOff": 45,
  "gasThreshold": 1200,
  "gasClearThreshold": 1000
}
```

Đây là payload nằm trong envelope config có commandId/deviceId/expiresAt, không phải gửi JSON cấu hình trần. Xem [MQTT-CONTRACT](MQTT-CONTRACT.md). Node cũ thiếu ngưỡng đèn nhận giá trị mặc định 30/45 qua API; cập nhật mode/ngưỡng sẽ gửi cấu hình đầy đủ, chỉ ghi cấu hình xác nhận sau ACK. Không cần xóa DB hoặc đăng ký lại node. Defaults của BE không chứng minh firmware đã nhận cấu hình: phải gửi và đối chiếu ACK.

- Auto local: quạt theo fanOn/fanOff; đèn theo lightOn/lightOff; giữa hai ngưỡng giữ trạng thái. Cả hai chạy độc lập trên một node.
- Manual: cùng node nhận actuator `fan`, `light`, `buzzer`. Chờ ACK chuyển Manual trước khi điều khiển. Cảnh báo gas vẫn bảo vệ còi ở cả hai mode.
- ACK/state phải phản ánh đầu ra thật; không coi MQTT publish thành công là đã thực thi. Hợp đồng heartbeat, fault, dedup, thời hạn 15 giây và ACL không đổi.
- RNN tiếp tục dùng nhiệt độ/độ ẩm; gas dùng rule ngưỡng, LDR dùng rule đèn, chưa thêm hai chỉ số này vào mô hình RNN.

## Giao diện và thử nghiệm

Admin và Home hiển thị nhiệt độ/độ ẩm/ánh sáng/gas trên cùng node. Cấu hình climate có cả ngưỡng quạt, nhiệt, đèn và gas. Trang `/app#control` có quạt/còi/đèn; voice “Bật đèn” áp dụng cho node đang chọn. Viewer chỉ xem. Biểu đồ Home và trang Dữ liệu cảm biến có các đường theo đơn vị riêng; CSV lưu đủ bốn chỉ số.

Thử lần lượt: một JSON chứa đủ readings → cùng một record/ID/phòng → chỉnh lightOn/lightOff chờ ACK → Manual bật/tắt đèn chờ ACK → Auto quạt và đèn → gas/còi → viewer bị 403 → giá trị sai/thiếu/trùng → reconnect.

`npm test` có multisensor.test.js; browser QA kiểm tra biểu đồ bốn chỉ số, đèn manual/voice trên cùng node và mobile. Simulator có đủ số đo nhưng phải ghi nguồn demo, không coi là cảm biến thật.

**Firmware trong repo vẫn legacy:** BE/FE đã hỗ trợ node kết hợp; sketch chưa đổi topic/envelope/heartbeat/ACK/NTP/NVS như [REVIEW](../firmware/REVIEW.md). Nhóm phần cứng cần sửa theo contract và compile/flash/kiểm chứng mạch trước khi demo đầu cuối. Việc mở rộng phần mềm không tự cập nhật chương trình đã nạp trong ESP32.
