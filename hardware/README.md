# Hồ sơ phần cứng

**Trạng thái: đã có [GPIO mapping theo firmware](PINOUT.md); chưa có BOM, sơ đồ nối dây hoặc ảnh mạch đã xác minh.** GPIO mới được trích từ code, chưa đối chiếu mạch thật. Các mục dưới đây là danh sách bàn giao, không phải thiết kế điện đã hoàn thành.

Phạm vi theo firmware đã nhận: một ESP32 với DHT11, MQ-2, LDR, LED, relay/quạt và còi. Đã trích GPIO theo code trong PINOUT.md; vẫn cần xác nhận model board, driver, nguồn và chân thực tế. Chưa có sơ đồ mạch đã kiểm chứng.

| Tệp cần bổ sung | Nội dung |
| --- | --- |
| `BOM.csv` | Tên/model linh kiện, số lượng, thông số nguồn, vai trò |
| `wiring.pdf` hoặc `wiring.png` | Sơ đồ board–sensor–driver–actuator, VCC/GND và chân tín hiệu |
| `PINOUT.md` | GPIO, chiều input/output, mức kích hoạt, pull-up/pull-down, trạng thái boot |
| `photos/` | Ảnh tổng thể và các điểm nối, chú thích device ID |
| `POWER-AND-TEST.md` | Nguồn, driver bảo vệ phù hợp tải, cách đo/kiểm tra từng khối và kết quả |

Quạt/relay phải dùng mạch điều khiển và nguồn phù hợp; xác nhận điện áp của module trước khi nối GPIO. Phần mềm không chứng minh được mạch vật lý an toàn hay đấu đúng.

Bàn giao kèm [firmware](../firmware/README.md), [hướng dẫn kết nối](../docs/HARDWARE-INTEGRATION.md) và video end-to-end. Giữ thông tin chân và linh kiện nhất quán giữa firmware, sơ đồ và báo cáo.
