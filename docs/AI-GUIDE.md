# AI cảnh báo cảm biến và giờ đăng nhập

## Trạng thái và phạm vi

**Biểu đồ học AI:** trong Kết quả & đánh giá của node, RNN có số cửa sổ Train/Validation/Test, loss theo epoch, dự báo so với số đo trên tập test độc lập (preview tối đa 120 điểm lưu trong report), MAE so với baseline và score/ngưỡng suy luận. KDE có nút Biểu đồ học đăng nhập: số mẫu từng giờ (sau lọc/khử trùng đúng như model), mật độ KDE trên chu kỳ 24 giờ và score/ngưỡng lưu của từng login thật. KDE không có loss/epoch; không trình bày như huấn luyện RNN. Dữ liệu chart được tổng hợp khi xem, không lưu cả đường KDE vào mỗi lần login. Model cũ chưa có test_preview dùng kết quả suy luận đã lưu; không có dữ liệu thì không tạo đường giả. Quyền xem vẫn theo nhà/tài khoản.

**Giao diện lịch sử hiện tại:** chỉ hiển thị thời gian và tên/email người đăng nhập; các dòng bootstrap không được đưa vào bảng đăng nhập đã quan sát. Seed vẫn ở DB và dùng học cùng dữ liệu thật. Thẻ chính hiển thị giờ thường dùng và kết quả lưu của lần login thật gần nhất, không lấy đánh giá giờ hiện tại của profile để giả thành sự kiện mới. Nút Chi tiết đánh giá hiển thị user/thời điểm/algorithm/baseline_events/score/threshold từ LoginEvent.analysis. Event cũ thiếu đánh giá giữ nguyên, không phân loại lại rồi ghi đè lịch sử. KDE tính phân bố/ngưỡng từ lịch sử trước mỗi login, không có epoch train như RNN. RNN cảm biến vẫn train qua worker khi user bấm Huấn luyện, sau đó suy luận theo telemetry.

**Chính sách seed hiện tại (thay phần ví dụ riêng trước đây):** Docker local bật `AI_LOGIN_SEED=true`. Mỗi operator/viewer được tạo 32 LoginEvent `source=bootstrap` trên 8 ngày trước, giờ 08:10/09:10/19:10/20:10, đúng một lần. Marker lưu trong Setting để restart không nhân bản; upsert ID cố định cho phép phục hồi nếu khởi tạo gián đoạn. Login thật vẫn `source=server`, được đánh giá cùng baseline rồi lưu sau đánh giá. Không có cơ chế giảm trọng số riêng; lịch sử 90 ngày và TTL 120 ngày vẫn áp dụng. Đây là lịch sử giả lập khởi tạo phục vụ đồ án, không phải quan sát người dùng. Báo cáo cần phân biệt nguồn seed và thực. Không seed telemetry, thiết bị, model RNN hoặc cảnh báo giả. Đã bỏ nút/API login-example. Lịch sử giao diện ghi nguồn Khởi tạo/Thực tế để tránh nhầm. `.env.example` để seed=false cho môi trường khác.

**Cập nhật login:** bỏ điều kiện chờ 5 ngày. KDE bắt đầu đánh giá sơ bộ từ 6 mẫu giờ khác nhau, có thể chỉ trong một ngày; đăng nhập lặp cùng giờ vẫn chỉ một mẫu. Khi chỉ có một ngày, hiệu chỉnh leave-one-slot-out; nhiều ngày dùng leave-one-day-out. Dữ liệu ít được gắn preliminary, không coi là bằng chứng chắc chắn về thói quen. User có nút **Thử bằng dữ liệu mẫu** gọi /api/ai/login-example: minh họa giờ quen/giờ lạ ngay bằng synthetic, không ghi LoginEvent/AccountAlert/telemetry hoặc ảnh hưởng baseline thật. RNN cảm biến vẫn cần dữ liệu chuỗi đủ dài; thay đổi này chỉ dành cho mô hình giờ đăng nhập.

Giá trị sử dụng: rule nhiệt/gas xử lý ngưỡng cụ thể; RNN bổ sung cảnh báo khi chuỗi nhiệt/ẩm lệch mẫu bình thường dù chưa vượt ngưỡng, để người vận hành kiểm tra môi trường/cảm biến. Đây không phải chẩn đoán hỏng. KDE đăng nhập cảnh báo giờ hiếm so với lịch sử cá nhân để chính chủ kiểm tra phiên; không phát hiện chắc chắn người lạ, không thay xác thực. Login dùng KDE, không dùng RNN. Model cảm biến tách theo node; lịch sử login tách theo user. Admin xem nhiều node không có nghĩa lấy chung một model/trộn chuỗi các node.

Đã triển khai hai mô hình chạy cục bộ trong backend Node.js, không gọi API chatbot/AI bên ngoài:

1. **Elman RNN** (tanh, linear output, BPTT + Adam) dự báo nhiệt độ/độ ẩm và chấm residual để phát hiện biến thiên bất thường. Đây là RNN thường, **không phải LSTM** trong đề xuất ban đầu. Huấn luyện chạy trong worker thread để không chặn MQTT/HTTP.
2. **Circular KDE** học phân bố giờ đăng nhập thành công của từng tài khoản theo Asia/Ho_Chi_Minh. Đây là mô hình thống kê học từ lịch sử, không phải rule “đăng nhập ban đêm là xấu”.

Phạm vi một ESP32 climate (DHT + quạt/còi). AI không tự thay đổi ngưỡng, phát lệnh, khóa user hoặc kết luận thiết bị hỏng/tài khoản bị xâm nhập. Không có push/email khi app đóng; cảnh báo hiển thị trong app đang dùng và được lưu để xem lại.

## Sử dụng trên giao diện

- Admin: mở `/` → **AI & bảo mật**. Xem model theo thiết bị và cảnh báo đăng nhập toàn hệ thống.
- Operator/viewer: mở `/app#ai`. Dữ liệu AI cảm biến chỉ trong nhà được phép; lịch sử đăng nhập chỉ của tài khoản hiện tại. Khi không có nhà vẫn mở được trang AI để xem tài khoản.
- Operator/chủ nhà và admin được **Huấn luyện RNN** cho node climate thuộc quyền quản lý. Viewer chỉ xem model/kết quả.
- Chọn 1/3/7/30 ngày, xác nhận dữ liệu đại diện hoạt động bình thường. Mặc định chỉ dùng nguồn `hardware`; muốn thử dữ liệu demo phải chọn rõ và model được đánh dấu DEMO.
- Theo dõi tiến trình và mở **Kết quả & đánh giá**: loss train/validation, MAE/RMSE test, baseline, đồ thị thực tế/dự báo. Nếu lần retrain mới lỗi, model ready trước đó vẫn được dùng; lỗi tác vụ mới hiển thị riêng.
- Cảnh báo đăng nhập: chính chủ bấm **Đây là tôi** hoặc **Không phải tôi**. Admin được xem cảnh báo của người khác nhưng không được dạy mô hình thay họ. Nếu không nhận ra, đổi mật khẩu ở Cá nhân/Cài đặt và kiểm tra phiên; đổi mật khẩu thu hồi phiên khác theo auth hiện có.

## RNN: dữ liệu và tiền xử lý

- Telemetry lưu `source=hardware` khi nhận ở DEMO_MODE=false, `demo` khi mô phỏng, `unknown` với dữ liệu cũ chưa xác định. Đây là nhãn chế độ nhận, **không tự chứng minh gói MQTT đến từ cảm biến vật lý**. Test inject phải được tách/ghi nhãn trước khi dùng huấn luyện thật.
- Nguồn dữ liệu: device_id, recorded_at, temperature °C, humidity %RH. Không dùng lightPercent hoặc gộp nhầm các nhà/node.
- Chỉ dùng giá trị hữu hạn/hợp lệ, sort theo thời điểm đo, lấy bản cuối trong bucket 10 giây đã đóng. Không lấy mẫu từ tương lai, không nội suy qua khoảng mất mạng.
- Tối thiểu 360 mẫu sau resample, khoảng một giờ dữ liệu đều; cửa sổ 12 mẫu (2 phút) với hai feature để dự báo bước 10 giây kế tiếp. Đây là ngưỡng kỹ thuật để chạy, không bảo đảm dữ liệu đủ đa dạng để dùng ngoài thực tế.
- Tách 60/20/20 train/validation/test theo thời gian trước khi tạo cửa sổ; không có cửa sổ chạy qua biên. Scaler chỉ fit train; scale có floor .25°C/1%RH để tránh chia rất nhỏ với cảm biến ít dao động.
- Khoảng trống làm cửa sổ bị đứt; cần thu lại đủ cửa sổ liên tục. AI thiếu dữ liệu hiển thị warmup/stale, không mặc định normal.
- Mỗi tác vụ lấy tối đa 20.000 bản ghi mới nhất trong khoảng đã chọn, không phải không giới hạn toàn bộ lịch sử.

## RNN: huấn luyện, ngưỡng và kết quả

Mạng 2 input → 8 hidden tanh recurrent → 2 linear output; học bằng MSE, Adam lr=.003, batch 32, gradient clip [-5,5], tối đa 40 epoch, early stopping 6 epoch. Seed 42 được lưu để tái hiện. Model chọn theo validation loss, không theo tập test.

Score là MSE residual trên hai feature đã chuẩn hóa. Ngưỡng lấy từ percentile 99 của residual validation với hệ số 1.25 + .02 và floor .08. Đây là hyperparameter đã công bố, có thể cần đánh giá lại trên dữ liệu thật; score không phải xác suất.

Hai bucket bất thường liên tiếp mới tạo một Alert kind `ai_anomaly`; ba bucket normal liên tiếp kết thúc bất thường. Một đợt không tạo lại cảnh báo khi vẫn open/acknowledged. Model/score lưu MongoDB, không bị mất chỉ vì restart container. Số đo và thời gian/model ID của kết quả vẫn được giữ; khi node offline/kết quả cũ không hiển thị như suy luận hiện tại.

Model artifact/weights không trả về frontend. `AiModel.report` lưu cấu hình, nguồn, sample counts, time split, loss curve, MAE/RMSE theo đơn vị gốc và baseline persistence (giá trị kế tiếp = giá trị vừa đo). Không có nhãn độc lập thì detection_metrics=null, không tự tạo precision/recall/F1.

Huấn luyện một tác vụ cùng lúc, worker tối đa 256 MB và giới hạn 120 giây. Queue suy luận giới hạn, trigger sau telemetry hợp lệ, xử lý nền khoảng mỗi 2 giây. RNN lỗi không làm thay đổi logic Auto ở ESP32. Base hiện chạy một process backend; trước khi scale nhiều instance cần điều phối job/khóa phân tán.

## Giờ đăng nhập: dữ liệu, học và cảnh báo

- Server ghi thời điểm sau khi password/user hợp lệ. Login thất bại không làm dữ liệu học. Trình duyệt không được gửi timestamp tùy ý thay giờ server.
- Account mới cần ít nhất **6 mẫu giờ hợp lệ**, không bắt buộc nhiều ngày. Tối đa một mẫu trong một giờ/ngày; các ngày có trọng số cân bằng. Đánh giá có ít hơn 20 mẫu hoặc dưới 5 ngày được ghi sơ bộ; login spam cùng giờ không đủ vượt cold start.
- Mỗi lần đánh giá dùng tối đa 1.000 sự kiện trong 90 ngày **trước lần hiện tại**. Cùng giờ qua nửa đêm được xử lý vòng tròn 24 giờ; bandwidth 60 phút.
- Ngưỡng negative-log-density được hiệu chỉnh leave-one-day-out: median + max(1,4*MAD), giảm tác động của một lần đăng nhập hiếm đơn lẻ.
- Nếu chưa có LoginEvent, import lịch sử `AuditLog auth.login` có actor_id của chính user, trong giới hạn trên. Nguồn `legacy_audit` được ghi rõ. Không tự seed giờ giả vào tài khoản thật để làm demo.
- Lần hiện tại được ghi sau khi đánh giá. Anomaly chưa được chính chủ xác nhận và sự kiện unrecognized/unavailable không được dùng làm baseline hợp lệ.
- Xác nhận expected cho phép dùng sự kiện trong lịch sử học; một lần xác nhận không nhất thiết lập tức thay đổi toàn bộ thói quen. Thói quen mới cần được hình thành qua dữ liệu nhiều ngày.
- AccountAlert và LoginEvent tách khỏi cảnh báo thiết bị/nhà. Operator/viewer không thấy lịch sử của người cùng nhà; admin thấy danh sách cảnh báo, không API đọc lịch sử riêng của người khác.
- LoginEvent có TTL 120 ngày; model dùng cửa sổ 90 ngày. Không thu IP/vị trí hoặc fingerprint cho mô hình này.
- Nếu AI lỗi, đăng nhập bằng mật khẩu hợp lệ vẫn thành công, response loginAnalysis=unavailable. Không biến lỗi AI thành “an toàn”.

Giới hạn: chỉ học thời điểm trong ngày, chưa xét ngày làm việc/cuối tuần, địa điểm hay thiết bị. Giờ lạ có thể do đổi lịch/đi xa; giờ quen không chứng minh người đăng nhập là đúng chủ. Tính năng bổ trợ auth/rate-limit/session, không thay thế chúng.

## Tái hiện thực nghiệm và kiểm thử

```powershell
npm.cmd test
npm.cmd run test:ai-ui
npm.cmd run ai:demo
```

`ai:demo` không dùng MongoDB/broker hoặc tài khoản thật. Nó tạo chuỗi synthetic, tách train/validation/test, inject hai đoạn spike chỉ vào phần test, đánh giá point-level và xuất `.artifacts/ai-demo-report.json`. Bộ giờ đăng nhập cũng là fixture tổng hợp có nhãn. File report ghi rõ synthetic/hardware_validated=false.

Một lần chạy hiện tại cho sensor detection precision≈0.778, recall=1, F1≈0.875 trên 132 điểm synthetic; login fixture 24 điểm cho F1=1. Đây là kết quả fixture dễ, **không phải hiệu quả cảm biến thật hoặc phát hiện xâm nhập thực tế**. Baseline persistence dự báo chuỗi synthetic trơn tốt hơn RNN trong lần chạy này; báo cáo giữ nguyên kết quả so sánh, không khẳng định RNN luôn tốt hơn. Chạy lại để xem số liệu trực tiếp, không lấy các số này làm kết quả hardware.

Để đánh giá thực: thu nhiều phiên từ ESP32, ghi nhật ký điều kiện phòng và nhãn sự kiện độc lập, không chỉnh threshold bằng test; đo forecast MAE/RMSE, precision/recall/F1 nếu có nhãn, số đợt báo giả/giờ, độ trễ sự kiện và thời gian suy luận. Kết quả synthetic không thay thế bước này.

Test hiện có: finite-difference gradient cho BPTT, chronological split, causal resample, gap/stale, serialize model, cold start, midnight/night-worker, loại anomaly khỏi baseline, auth không bị AI lỗi chặn, quyền train/xem/review, worker thật + persistence, model cũ còn sau retrain lỗi và browser desktop/mobile.

## Docker và firmware

Docker đóng gói chương trình **chạy trên máy chủ**. Trong bản này AI là worker Node nằm trong image app; không cần container Python hoặc GPU riêng. Compose HTTPS có app/proxy + Atlas bên ngoài; Compose local có app/MongoDB demo riêng. Broker vẫn cấu hình ngoài theo HARDWARE-INTEGRATION. Xem [cách chạy và bằng chứng còn thiếu](../deployment/README.md).

Firmware là mã nạp vào ESP32 và chạy trên vi điều khiển. Không cần code firmware để build/chạy image Express hiện tại. Nhóm vẫn cần nộp firmware/wiring/thông tin board để tái hiện đồ án. Nếu sau này dùng Docker làm môi trường compile firmware thì đó là container build riêng, không phải container chạy board vật lý.

Khi broker ở máy host mà BE chạy Docker: 127.0.0.1 trong container không trỏ về host. Có thể cấu hình MQTT_URL=mqtt://host.docker.internal:1883 trong lab; Compose đã thêm host-gateway mapping. Khi broker ở service khác, dùng tên service/port phù hợp; khi public dùng MQTT/TLS với host/chứng chỉ hợp lệ. Không thay secret trong `.env` bằng thông tin minh họa.

`AI_ENABLED=false` tắt học/suy luận sau restart BE; không cần khóa web/điều khiển. Dockerfile copy `backend/`, `database/`, `frontend/public/` và `docs/`; bản local đã build/chạy trong Docker. Broker lab ở host:1884, cấu hình overlay nằm trong deployment/compose.mqtt-lab.yaml. AI vẫn mới có kết quả synthetic, chưa có đánh giá cảm biến thật.

Bảng đối chiếu đủ bảy nội dung của mục 5.2: [REQUIREMENTS-STATUS.md](REQUIREMENTS-STATUS.md). Bản kết quả synthetic lưu để nộp cùng repo: [ai-synthetic-report.json](experiments/ai-synthetic-report.json); không chứa dữ liệu người dùng thật.

## Mã nguồn và tham khảo

- `backend/src/ai/rnn.js`, `sensor-model.js`, `login-model.js`, `train-worker.js`: thuật toán/worker.
- `backend/src/services/ai.service.js`: train/score, learning/review, persistence và trigger.
- `backend/src/routes/aiRoutes.js`, `backend/src/controller/ai.controller.js`: API đã phân quyền.
- `database/models/ai-*.model.js`, `login-event.model.js`, `account-alert.model.js`: lưu kết quả và lịch sử.
- `frontend/public/assets/ai-panel.js`, `ai.css`: panel chung admin/operator/viewer.
- [Phương trình Elman RNN](https://docs.pytorch.org/docs/stable/generated/torch.nn.RNN.html) — tham khảo toán học; implementation dự án không dùng PyTorch.
- [Node worker threads](https://nodejs.org/api/worker_threads.html).
- [Đặc trưng thời gian tuần hoàn](https://scikit-learn.org/stable/auto_examples/applications/plot_cyclical_feature_engineering.html).
