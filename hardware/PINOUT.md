# Chân trong firmware được nhóm cung cấp

Nguồn `firmware/esp32_sensor/esp32_sensor.ino`, rà soát 14/11/2026. **Chưa đối chiếu mạch thật/model board; đây không phải sơ đồ đấu dây đã xác minh.**

| Thành phần | GPIO | Cách dùng trong code |
| --- | --- | --- |
| MQ-2 | 34 | analogRead, số ADC raw |
| LDR | 35 | 4095 - analogRead, tác giả quy ước sáng hơn = số lớn hơn |
| DHT11 | 16 | Nhiệt độ/độ ẩm, đọc mỗi 2 giây |
| Buzzer | 18 | digitalWrite HIGH/LOW, nhấp mỗi 150 ms khi gas vượt ngưỡng |
| LED | 19 | HIGH bật, LOW tắt |
| Relay/quạt | 23 | Code giả định relay active HIGH, LOW tắt, jumper H |

Nhóm phần cứng cần bổ sung tên board, sơ đồ VCC/GND/driver/nguồn, kiểm tra mức tín hiệu analog phù hợp ADC, xác nhận cực kích relay và loại buzzer. Giữ bảng này đồng bộ nếu đổi chân hoặc đấu dây. Ngưỡng gas/light 1200 là số raw trong firmware gốc; chưa phải phép đo ppm/lux đã hiệu chuẩn.
