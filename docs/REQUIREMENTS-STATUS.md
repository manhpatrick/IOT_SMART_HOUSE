# Đối chiếu yêu cầu đồ án và trạng thái bàn giao

Ngày rà soát ban đầu: **13/11/2026**, theo đề “IoT và ứng dụng” nhóm đã cung cấp, đặc biệt mục 4, 5.2, 5.3, 6–8. Đây là kiểm tra repository và thực nghiệm phần mềm, không phải xác nhận của giảng viên. Không suy ra đã triển khai thực tế chỉ từ việc có thư mục hay mã nguồn.

**Cập nhật 14/11/2026:** Docker local đã build/chạy, MQTT lab đã nhận số đo MQTTX. Đã nhận firmware nền, tách secrets và ghi GPIO; chưa compile/nạp hay ghép BE vì topic/JSON còn khác. Trạng thái tổng hợp: [CURRENT-STATUS.md](CURRENT-STATUS.md); chi tiết [firmware/REVIEW.md](../firmware/REVIEW.md).

## Phạm vi một ESP32

Mục 4.2 yêu cầu **ít nhất một thiết bị vật lý**; từ hai node đối với nhóm bốn thành viên là **khuyến nghị**. Firmware đã nhận dùng một ESP32 với DHT11/MQ-2/LDR/LED/quạt/còi; BE cần profile gộp và firmware cần sửa giao thức. Chưa có bằng chứng compile/board thật. Một board gắn nhiều cảm biến vẫn là một node vật lý.

## AI đáp ứng bảy nội dung trình bày như thế nào?

**Chức năng chính:** phát hiện dữ liệu môi trường bất thường bằng residual dự báo RNN. **Chức năng bổ sung:** phát hiện sự kiện đăng nhập lệch thói quen bằng circular KDE, gắn với tài khoản và audit của chính hệ thống. Cả hai xử lý dữ liệu nghiệp vụ cục bộ; không phải chatbot/API AI rời rạc.

| Nội dung thầy yêu cầu | AI cảm biến | AI giờ đăng nhập |
| --- | --- | --- |
| Nguồn và đặc điểm dữ liệu | Telemetry theo device ID, timestamp, nhiệt độ °C và độ ẩm %RH; nguồn demo/hardware/unknown. Chuỗi thời gian của một node climate | Login thành công do server ghi; lịch sử theo từng tài khoản, tối đa 1.000 sự kiện/90 ngày; có thể import audit cũ |
| Tiền xử lý | Lọc giá trị sai; sắp theo thời gian; lấy mẫu cuối bucket 10 giây đã đóng; không nội suy khoảng mất mạng; chuẩn hóa bằng train; cửa sổ 12 điểm | Quy đổi Asia/Ho_Chi_Minh thành phút trong ngày; thời gian tuần hoàn 24 giờ; tối đa một mẫu/giờ/ngày, trọng số cân bằng theo ngày; loại hiện tại/tương lai và anomaly chưa xác nhận |
| Mô hình/thuật toán | Elman RNN, 2 input → 8 hidden tanh → 2 output tuyến tính. Không phải LSTM. Dự báo bước tiếp theo rồi chấm sai số | Circular Gaussian KDE, bandwidth 60 phút; density thấp là giờ ít gặp. Mô hình thống kê học từ dữ liệu, không phải rule cấm đăng nhập ban đêm |
| Huấn luyện/cấu hình | Tối thiểu 360 điểm đều sau resample; split 60/20/20 theo thời gian trước tạo cửa sổ; BPTT/Adam, tối đa 40 epoch, early stop; hiệu chỉnh ngưỡng từ validation | Ít nhất 20 mẫu trên 5 ngày; học lại theo lịch sử hợp lệ; hiệu chỉnh leave-one-day-out với median và MAD; không cần gradient/epoch |
| Chỉ số đánh giá | MAE/RMSE theo °C/%RH, loss, baseline persistence; precision/recall/F1 trên tập test có nhãn; cần đo thêm báo giả/giờ và độ trễ thực tế | Precision/recall/F1, confusion matrix trên fixture giờ thường/hiếm; cần đánh giá lịch sử thực có xác nhận, tỷ lệ báo giả và cold start |
| Kết quả thử nghiệm | Synthetic 132 điểm: TP=14, TN=114, FP=4, FN=0; precision 0,778; recall 1; F1 0,875 | Synthetic 24 sự kiện: TP=12, TN=12, FP=0, FN=0; F1=1 trên bộ fixture đơn giản |
| Tích hợp hệ thống | MQTT → Telemetry → queue suy luận → AiResult/Alert → API và panel AI; 2 bucket bất thường mở cảnh báo, 3 bình thường kết thúc | Password hợp lệ → phân tích lịch sử trước lần hiện tại → LoginEvent/AccountAlert → banner và trang AI; chính chủ xác nhận “Đây là tôi/Không phải tôi” |

Đã có code, UI, tests và báo cáo synthetic tái hiện được. **Chưa hoàn chỉnh bằng chứng AI thực tế**: cần dữ liệu từ ESP32, nhãn độc lập, lịch sử đăng nhập thực đủ ngày và demo trực tiếp. Nhãn source=hardware chỉ là chế độ nhận MQTT, không tự chứng minh dữ liệu đo vật lý. Không gọi F1=1 của fixture là “100% phát hiện hacker”.

Trên chuỗi synthetic trơn, persistence dự báo tốt hơn RNN: MAE nhiệt độ 0,035 so với 0,079°C; độ ẩm 0,060 so với 0,249%RH. Giữ kết quả này trong báo cáo; chưa có cơ sở khẳng định RNN vượt baseline trên dữ liệu thật. Các metric phát hiện bên trên là **point-level**, chưa đánh giá chính sách cảnh báo hai bucket liên tiếp.

Không có nhãn độc lập trong dữ liệu train thực thì report để detection_metrics=null. AI không tự khóa user, điều khiển quạt hoặc khẳng định thiết bị hỏng. Thông số vượt ngưỡng, offline và fault vẫn dùng quy tắc riêng; RNN không thay thế chúng.

Mã: `backend/src/ai/`, `backend/src/services/ai.service.js`, `database/models/ai-*`, `login-event.model.js`, `account-alert.model.js`, `frontend/public/assets/ai-panel.js`. Chi tiết: [AI-GUIDE](AI-GUIDE.md). Kết quả đã lưu: [báo cáo synthetic](experiments/ai-synthetic-report.json). Tái hiện: `npm run ai:demo` (xuất file mới vào `.artifacts/`, không sửa Atlas).

## Docker và realtime

| Hạng mục | Đã có | Còn thiếu để ghi nhận hoàn thành |
| --- | --- | --- |
| Docker | Local build/runtime, app/MongoDB healthy, web và API đã kiểm tra; Compose HTTPS có cấu hình | Minh chứng nộp bài, persistence sau down/up, HTTPS công khai, model sau restart và ESP32 thật |
| Broker | Mosquitto lab 1884, account BE/node, cấp quyền và telemetry MQTTX đã chạy | Test ACL sai topic, khóa client, ACK hai chiều và TLS/board thật; broker chạy ngoài Compose |
| Realtime | MQTT → DB → WS báo dữ liệu đổi → API scoped → cập nhật FE, polling khi socket đứt; cold/stale/offline và ACK timeout | Đo độ trễ sensor→dashboard, command→ACK, mất gói/reconnect và chạy ổn định trên phần cứng; có code chưa đủ kết luận đạt độ trễ |

Firmware **không cần nằm trong container**. Để đáp ứng mục Docker, cần triển khai và chứng minh phần mềm chạy trong container; không bắt buộc Docker hóa ESP32/Atlas/broker. Bằng chứng end-to-end vẫn cần board thực dù app đã chạy Docker. Xem [deployment/README](../deployment/README.md) cho lệnh và ca D01–D06.

## Đối chiếu phần bắt buộc và bài nộp

| Mục đề | Hiện có trong repo | Thiếu/chưa kiểm chứng |
| --- | --- | --- |
| 4.1 Phân tích bài toán | Phạm vi nhà/phòng, vai trò, nghiệp vụ trong README/HOMES-AND-MOBILE | Hoàn thiện báo cáo mục tiêu định lượng, ràng buộc giá/nguồn/mạng, nhu cầu và lý do cần IoT |
| 4.2 Thiết bị | MQTT contract, checklist bàn giao một ESP32 | Firmware compile/flash được, mạch hoạt động, heartbeat/reconnect/Auto thực |
| 4.3 Giao thức | Topics, payload, ID, timestamp, QoS, ACK, timeout, chống trùng; adapter MQTT | Thực nghiệm ESP32 + broker; TLS và ACL thực |
| 4.4 Backend | User/role, nhà/phòng, lifecycle, cấu hình, telemetry, lịch sử, CSV, cảnh báo, lệnh/ACK, audit | Demo thao tác trên board thật; kiểm tra khóa credential tại broker, không chỉ từ chối ở BE |
| 4.5 Bảo mật | Hash mật khẩu, session, CSRF, validation, phân quyền chéo nhà và viewer; tests quyền/invalid input | Bằng chứng TLS, credential riêng board, ACL broker; threat model và kiểm chứng triển khai |
| 4.6 Giao diện | Admin, operator/viewer và PWA; browser tests | Thử trên điện thoại thật qua HTTPS và luồng điều khiển thật |
| 6 Phân tích/thiết kế | Mô tả API/MQTT/lifecycle/quyền, sơ đồ luồng phần cứng và ERD nhà/phòng trong HOMES-AND-MOBILE | Hoàn thiện bộ thiết kế thống nhất: bối cảnh, use case, các lớp/kiến trúc, mạch vật lý, triển khai, ERD toàn hệ thống gồm AI, ít nhất 2 sequence, sơ đồ trạng thái, ma trận quyền và threat model |
| 7 Kiểm thử | 40 test tự động backend/AI; 3 bộ browser; kế hoạch E/R/S/A và Docker D | Kết quả đo thực, log/ảnh/video, các chỉ tiêu độ trễ/mất gói/ổn định; test retained status R18 còn vấn đề đã ghi nhận |
| 8.1 Repository | Đã chia thư mục, scripts/cấu hình, firmware nền đã tách secrets và GPIO theo mã | Firmware chưa tương thích BE, thiếu BOM/wiring/ảnh; cần lịch sử đóng góp từng thành viên, tag/release cuối và quyền giảng viên nếu private |
| 8.2–8.4 | Tài liệu kỹ thuật và kịch bản test/demo | Báo cáo hoàn chỉnh 20–30 trang, bảng phân công, slide 8–12 trang, demo trực tiếp và video dự phòng |

OTA, CI/CD, monitoring tập trung, tối ưu năng lượng và các mục 5.3 khác là hướng tùy chọn; không mặc định phải làm hết. AI và Docker không thay thế yêu cầu thiết bị thật/luồng đầu cuối. Khôi phục telemetry bị mất mạng cần buffer trong firmware; hiện chỉ có xử lý/dedup gói cũ phía BE nên chưa gọi là đồng bộ offline hoàn chỉnh.

## Thứ tự hoàn thiện đề xuất

1. Hai bạn phần cứng bàn giao firmware + BOM/GPIO/sơ đồ/ảnh cho một board; nối broker theo contract, chạy E2E và các ca reconnect/ACK/khóa client.
2. Chạy Docker local, ghi D01–D04; triển khai HTTPS và broker truy cập được nếu demo điều khiển từ xa.
3. Thu nhiều phiên dữ liệu ESP32 bình thường và sự kiện lab có nhãn; train RNN, giữ test độc lập, ghi forecast/detection/độ trễ. Không cố tạo tình huống nguy hiểm để lấy dữ liệu.
4. Tích lũy lịch sử login thực; fixture chỉ dùng minh họa thuật toán và kiểm thử. Ghi rõ khác biệt này khi bảo vệ.
5. Hoàn thiện bộ thiết kế, kết quả đo, báo cáo/slide; mỗi thành viên commit phần việc; chốt release sau khi kiểm thử trên máy sạch.
