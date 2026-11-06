# MQTT contract — ESP32 ↔ Backend

Node 01: `climate` = nhiệt độ/độ ẩm + quạt/còi. Node 02: `lighting` = ánh sáng + LED. Dùng hai ESP32, ID/client ID/tài khoản MQTT riêng. Không có cửa hoặc servo.

## Topic

Prefix mặc định `smartroom` (một cấp, không chứa `/`). Thay `{deviceId}` bằng `node-01`, `node-02` hoặc ID đã đăng ký.

| Topic | Bên gửi | QoS đề xuất | Retain |
| --- | --- | --- | --- |
| `smartroom/{deviceId}/telemetry` | ESP32 | 0 hoặc 1 | false |
| `smartroom/{deviceId}/status` | ESP32/LWT | 1 | true |
| `smartroom/{deviceId}/command` | BE | 1 | false |
| `smartroom/{deviceId}/config` | BE | 1 | false |
| `smartroom/{deviceId}/ack` | ESP32 | 1 | false |

ESP32 chỉ publish telemetry/status/ack của chính mình; chỉ subscribe command/config của chính mình. Backend dùng tài khoản riêng để đọc các node và gửi lệnh. QoS 1 cần thư viện firmware hỗ trợ publish QoS 1; đừng mặc định mọi thư viện MQTT Arduino đều hỗ trợ.

## Telemetry climate

```json
{
  "deviceId": "node-01",
  "bootId": "random-id-for-this-boot",
  "seq": 1,
  "timestamp": "2026-11-06T08:00:00.000Z",
  "readings": { "temperature": 29.2, "humidity": 65.1 },
  "state": { "fan": false, "buzzer": false, "mode": "AUTO" }
}
```

`temperature`: °C, [-40,80]. `humidity`: %RH, [0,100]. Climate phải có cả hai trường. Không gửi giá trị đọc lỗi như NaN hoặc số giả; gửi trạng thái lỗi và thử đọc lại.

## Telemetry lighting

```json
{
  "deviceId": "node-02",
  "bootId": "random-id-for-this-boot",
  "seq": 1,
  "timestamp": "2026-11-06T08:00:00.000Z",
  "readings": { "lightPercent": 28 },
  "state": { "light": true, "mode": "AUTO" }
}
```

`lightPercent`: độ sáng tương đối [0,100], quy ước số lớn = sáng hơn. Hai bạn firmware tự map giá trị ADC theo mạch LDR, không gọi đây là lux khi chưa hiệu chuẩn. Lighting bắt buộc có lightPercent.

Chu kỳ gợi ý 4 giây, `seq` tăng cho mỗi bản tin; `bootId` đổi mỗi lần khởi động. Timestamp UTC ISO 8601, đồng bộ NTP; BE cho phép tối đa 7 ngày trước và 2 phút tương lai. Bộ ba deviceId/bootId/seq chống duplicate. Chu kỳ đọc phải phù hợp cảm biến thực tế.

## Heartbeat/LWT

ESP32 thiết lập LWT trước CONNECT:

```json
{ "online": false }
```

Khi kết nối và mỗi 10 giây:

```json
{ "online": true, "firmware": "1.0.0", "fault": null }
```

`fault` có thể là mô tả lỗi ngắn. Khi ngắt có chủ đích, publish offline trước DISCONNECT vì LWT chủ yếu dành cho ngắt bất thường. Ngưỡng offline mặc định 35 giây, có thể chỉnh từ admin. Broker LWT có thể đến sau tùy keepalive; heartbeat timeout vẫn giúp BE phát hiện.

## Lệnh điều khiển

BE publish không retained:

```json
{
  "commandId": "uuid",
  "deviceId": "node-01",
  "kind": "actuator",
  "payload": { "actuator": "fan", "value": true },
  "timestamp": "2026-11-06T08:00:00.000Z",
  "expiresAt": "2026-11-06T08:00:15.000Z"
}
```

Các actuator: climate = `fan`, `buzzer`; lighting = `light`. Điều khiển trực tiếp chỉ khi cấu hình `MANUAL`. Dùng lệnh đặt trạng thái cụ thể `true/false` để dễ idempotent, không dùng lệnh toggle.

## Cấu hình

```json
{
  "commandId": "uuid",
  "deviceId": "node-01",
  "kind": "config",
  "payload": { "mode": "AUTO", "fanOn": 30, "fanOff": 28, "temperatureAlert": 35 },
  "timestamp": "2026-11-06T08:00:00.000Z",
  "expiresAt": "2026-11-06T08:00:15.000Z"
}
```

Lighting payload: `{ "mode": "AUTO", "lightOn": 30, "lightOff": 45 }`.

- Climate AUTO: nhiệt độ ≥ fanOn thì bật quạt; ≤ fanOff thì tắt; giữa hai ngưỡng giữ trạng thái. Nhiệt độ ≥ temperatureAlert bật còi.
- Lighting AUTO: sáng ≤ lightOn thì bật LED; ≥ lightOff thì tắt; giữa hai ngưỡng giữ trạng thái.
- MANUAL: giữ trạng thái đầu ra đã được yêu cầu qua lệnh.
- Lưu cấu hình vào NVS nếu cần giữ qua lần reset; vẫn chạy Auto khi mất server.

## ACK

ESP32 gửi sau khi thực thi:

```json
{
  "commandId": "uuid",
  "status": "applied",
  "message": "Applied output state",
  "state": { "fan": true, "buzzer": false, "mode": "MANUAL" }
}
```

Nếu lỗi: `status: "failed"`, thêm message. Thiếu commandId hoặc ACK sai topic sẽ không xác nhận được lệnh. ACK trùng không áp dụng lại. Backend chỉ cập nhật config khi applied và chưa hết hạn.

Firmware cần kiểm tra expiresAt và deviceId, bỏ lệnh hết hạn, ghi nhớ các commandId gần nhất và gửi lại ACK cũ khi nhận trùng. MQTT PUBACK không thay thế application ACK. Backend hiện không tự retry lệnh; người dùng có thể gửi lại sau timeout với commandId mới.

## Kiểm thử ghép phần cứng

1. Đọc dữ liệu thật → publish → BE lưu → web cập nhật.
2. Đổi ngưỡng/Auto/Manual → ACK → DB và UI cập nhật.
3. Bật/tắt đầu ra → ACK → xác nhận chân đầu ra bằng mô hình thực tế.
4. Tắt Wi-Fi → offline/cảnh báo; khôi phục → tự reconnect và đăng ký lại topic.
5. Publish topic của node khác → broker từ chối; không chỉ kiểm tra BE bỏ bản tin.
6. Admin khóa node → broker ngắt phiên và từ chối CONNECT lại.
7. Gửi duplicate/invalid/late payload, ACK trễ và lệnh trùng.

Adapter hiện dùng topic control của Mosquitto Dynamic Security. Thiết lập broker/TLS/ACL và kiểm thử thực tế là phần bắt buộc trước khi tuyên bố hoàn thiện luồng thiết bị thật. Tham khảo [Mosquitto Dynamic Security](https://mosquitto.org/documentation/dynamic-security/) và [ESP32 Wi-Fi API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/wifi.html).
