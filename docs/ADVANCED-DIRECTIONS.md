# Ba hướng nâng cao — demo một ESP32

Tài liệu này mô tả implementation hiện tại; bảng đối chiếu đề và các phần còn thiếu ở [REQUIREMENTS-STATUS](REQUIREMENTS-STATUS.md). Phạm vi vật lý dự kiến là một ESP32 đọc DHT, điều khiển quạt/còi. Mục 4.2 bắt buộc ít nhất một thiết bị thật; hai node cho nhóm bốn người là khuyến nghị.

## 1. Triển khai bằng Docker

**Vấn đề:** thành viên hoặc máy chủ mới cần chạy cùng phiên bản môi trường, không cài thủ công từng dependency.

**Đã triển khai cấu hình:** Dockerfile multi-stage Node 24, build Tailwind, runtime non-root, healthcheck và loại secret khỏi image. Compose local chạy app + MongoDB có volume, dùng dữ liệu mô phỏng riêng. Compose HTTPS chạy app + Caddy, kết nối Atlas và broker bên ngoài. AI Node worker nằm trong app; không có container Python. Firmware được nạp riêng vào ESP32.

**Kết quả hiện tại:** Docker local build/start thành công, app/MongoDB healthy; web và API hoạt động. MQTT lab ngoài container đã nhận số đo từ MQTTX. **Cần bổ sung:** restart giữ dữ liệu/model, test đầy đủ AI trong container, HTTPS công khai và luồng ESP32 thật. Broker ngoài container vẫn cần cấu hình và cách tái hiện trong bài nộp.

**Sản phẩm nộp:** [deployment/](../deployment/README.md), log D01–D06, ảnh container/web, image ID và sơ đồ triển khai đúng môi trường đã chạy.

## 2. AI phát hiện bất thường cảm biến và giờ đăng nhập

**Vấn đề chính:** giá trị cảm biến vẫn trong giới hạn hợp lệ nhưng diễn biến khác lịch sử bình thường. Ví dụ nhiệt độ tăng nhanh bất ngờ cần kiểm tra, dù chưa vượt ngưỡng cảnh báo cố định. Đây là cảnh báo biến thiên bất thường, không phải chẩn đoán cảm biến hỏng.

**Implementation:** Elman RNN 2 input → 8 hidden tanh → 2 output; cửa sổ 12 mẫu cách nhau 10 giây để dự báo bước tiếp theo. Chuẩn hóa train-only; split thời gian 60/20/20; BPTT + Adam, early stopping, threshold hiệu chỉnh trên validation. Worker chạy trong Node. Đề xuất LSTM/Python ban đầu chưa được triển khai; không gọi mô hình hiện tại là LSTM.

**Tích hợp:** Telemetry → hàng đợi AI → dự báo/sai số → AiResult và Alert → API phân quyền theo nhà → panel AI. Hai bucket bất thường liên tiếp mở cảnh báo, ba bucket bình thường kết thúc. Offline/thiếu chuỗi có trạng thái riêng; không tự gửi lệnh điều khiển.

**Bổ sung theo tài khoản:** circular KDE học phân bố giờ đăng nhập 24 giờ theo Asia/Ho_Chi_Minh; tối thiểu 20 mẫu trên 5 ngày. Dùng lịch sử trước lần hiện tại, loại anomaly chưa xác nhận; giờ hiếm tạo AccountAlert để chính chủ xem/xác nhận. AI không tự khóa tài khoản.

**Đánh giá:** MAE/RMSE và baseline persistence cho dự báo; precision/recall/F1 khi có nhãn. Đã có test synthetic, report và UI; chưa có đánh giá cảm biến/người dùng thật. Persistence dự báo tốt hơn RNN trên fixture trơn hiện tại nên chưa khẳng định lợi thế RNN. Cần thu nhiều phiên, nhãn độc lập và báo giả/giờ, độ trễ.

**Sản phẩm nộp:** [AI-GUIDE](AI-GUIDE.md), bảng bảy nội dung của đề trong [REQUIREMENTS-STATUS](REQUIREMENTS-STATUS.md), [report synthetic](experiments/ai-synthetic-report.json), sau đó bổ sung dataset đã xử lý riêng tư, nhật ký thu thập và kết quả test thực.

## 3. Xử lý dữ liệu thời gian thực và tình huống mất kết nối

**Vấn đề:** người dùng cần biết số đo/trạng thái hiện tại và kết quả lệnh, tránh xem dữ liệu cũ như dữ liệu mới hoặc báo thành công khi chưa có ACK.

**Đã có:** MQTT ingest, validation/dedup, MongoDB, WebSocket gửi thông báo cập nhật và frontend tải lại qua API có phân quyền. Khi socket đứt có polling, reconnect và banner mất mạng. Theo dõi heartbeat, broker connection, số đo stale/missing, fault, timeout và receipt ACK bền vững. Một lệnh pending/node; không xếp hàng lệnh manual offline để chạy bất ngờ khi kết nối lại.

**Vai trò firmware:** đọc cảm biến, heartbeat/LWT, tự reconnect/subscribe, Auto local có hysteresis, xử lý commandId/expiresAt và ACK đúng kết quả. Firmware và buffer telemetry offline vẫn cần nhóm phần cứng bàn giao. Backend nhận gói cũ không chứng minh firmware đã có đồng bộ bù.

**Thực nghiệm cần làm:** đo sensor publish → dashboard và bấm lệnh → ACK/actuator; tối thiểu nhiều lần, báo median/p95/max; kiểm tra mất mạng, trùng gói, stale, reset và chạy liên tục. Có code realtime chưa đồng nghĩa đã đạt mục tiêu độ trễ. Retained status online cũ vẫn là điểm cần xử lý/kiểm chứng ở R18.

**Sản phẩm nộp:** [MQTT-CONTRACT](MQTT-CONTRACT.md), [FAILURE-HANDLING](FAILURE-HANDLING.md), [TEST-PLAN](TEST-PLAN.md), log/ảnh/video và bảng số đo thực. Base hiện một process backend; chưa khẳng định khả năng scale nhiều replica hoặc xử lý tải lớn.
