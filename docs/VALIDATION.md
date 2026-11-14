# Kết quả kiểm tra sau khi sắp xếp repository

## Admin giám sát nhà ngay trong console — 14/11/2026

Admin browser PASS: mở Chi tiết nhà, thấy danh sách thiết bị, không còn link /app trong console. AI browser PASS với admin truy cập /app#ai được chuyển về Tổng quan hệ thống. Gas browser PASS sau khi luồng kiểm tra web người dùng dùng operator thay admin. Thay đổi là phân tách giao diện, không bỏ quyền API đọc nhà của admin hoặc web desktop operator/viewer.

## Trực quan quá trình học hai mục đích AI — 14/11/2026

Backend **54/54 PASS**, AI browser PASS: RNN chart số cửa sổ ba tập, loss, dự báo có dữ liệu test thật từ worker; KDE chart 24 cột và 145 điểm mật độ, mở/đóng dialog không lỗi JS. API kiểm tra tổng mẫu histogram khớp baseline_events, mật độ đầu/cuối chu kỳ bằng nhau và preview ≤120 điểm hữu hạn. Test dùng dữ liệu fixture, không công bố hiệu quả ESP32 thật. Runtime RNN cần node/model đã train; không tự seed lại telemetry để làm biểu đồ.

## Lịch sử tối giản và bằng chứng KDE — 14/11/2026

Backend **54/54 PASS**; AI API chạy lại **7/7 PASS** sau bổ sung assertion seed không xuất hiện trong lịch sử, tên tài khoản đúng phạm vi, latest_evaluation gắn đúng event_id và seed vẫn có trong dữ liệu học. AI browser PASS: bảng đúng hai cột Thời gian/Người đăng nhập, mở Chi tiết đánh giá, không có nút thử mẫu. Các kết quả đánh giá lấy từ snapshot khi login, không tự đổi trạng thái sự kiện theo giờ mở trang.

## Cấu hình chung và KDE không chờ năm ngày — 14/11/2026

`npm test`: **54/54 PASS**. Bổ sung kiểm tra một ngày có sáu mẫu giờ đánh giá sơ bộ và hiệu chỉnh leave-one-slot-out, giữ chống đăng nhập lặp cùng giờ; endpoint login-example cần đăng nhập và không ghi LoginEvent/AccountAlert. Admin browser PASS: không còn password-form/role-matrix trên Cài đặt; lưu dataStaleSeconds dạng số và xác nhận DB. AI browser PASS: mở ví dụ synthetic trên tài khoản viewer, không tăng lịch sử. Các dữ liệu mẫu chỉ tồn tại trong response bộ thử, không seed lại dữ liệu đã xóa ở DB runtime. Build frontend PASS.

## Admin bỏ trang AI và lý do node không nhận lệnh — 14/11/2026

AI browser PASS: operator huấn luyện/xem report và cảnh báo tài khoản; viewer chỉ xem; admin không có mục AI ở console/Home, URL AI trực tiếp về tổng quan. Remote browser bổ sung ca node offline khóa đầu ra và giải thích cần client/heartbeat; không bật giả lập hoặc giả ACK trong chế độ MQTT để làm node cũ hiện online. Backend/giao thức điều khiển không đổi trong lần sửa UI này.

## Admin giám sát và dữ liệu nhiều node — 14/11/2026

`npm test`: **52/52 PASS**. Admin gửi actuator manual/voice hoặc đổi Auto/Manual bị 403; operator vẫn điều khiển đúng phạm vi, gas rule hệ thống không bị ảnh hưởng. Admin browser PASS cho bảng số đo theo từng node, chọn Xem node, bốn series của một climate, không có switch điều khiển hoặc select mode của admin; Home/remote browser PASS cho operator. Trang dữ liệu không lấy số đo mới nhất lẫn nhiều node để làm thẻ tóm tắt toàn hệ thống. Build frontend PASS. Các phép thử dùng DB/simulator biệt lập, chưa là minh chứng phần cứng thật.

## Web desktop và đăng xuất — 14/11/2026

Đã bỏ install/manifest/mobile navigation và gỡ worker/cache NODO cũ. Browser QA kiểm tra đăng nhập/đăng xuất từ header cả admin/operator/viewer, session bị hủy (API /auth/me 401), không còn nút cài app/manifest/mobile nav. Home browser PASS với luồng desktop và offline/reconnect; remote và gas browser PASS ở viewport desktop. Các kiểm tra mobile/PWA ghi trong mục lịch sử dưới đây không còn là phạm vi hiện tại. Backend session store có thể ghi lỗi touch cho request đang chạy khi phiên bị hủy; kiểm tra sau logout vẫn trả 401, không khôi phục phiên.

## Một ESP32 nhận đủ ba nhóm cảm biến — 14/11/2026

`npm test`: **51/51 PASS**, thêm năm ca multi-sensor: một bản tin lưu nhiệt độ/độ ẩm/ánh sáng/gas cùng ID, khử trùng/CSV, từ chối giá trị sai và nhận DHT cũ, ngưỡng đèn mặc định cho cấu hình cũ/chờ ACK, đèn manual/voice theo quyền và simulator Auto quạt/đèn độc lập. `npm run build`, `test:ui`, `test:home-ui`, `test:gas-ui`, `test:remote-ui` PASS; admin biểu đồ/bảng có đủ bốn chỉ số, Home có ngưỡng đèn và remote bật đèn qua voice/tắt bằng nút trên cùng node. Voice dùng mock SpeechRecognition, chưa xác minh micro thật. Docker MQTT đã build lại, app/MongoDB healthy. Firmware legacy chưa đổi protocol/compile/flash; các phép thử simulator không phải bằng chứng ESP32 thật. Hướng dẫn [ONE-NODE-MULTISENSOR](ONE-NODE-MULTISENSOR.md).

## Trang Điều khiển và voice — 14/11/2026

`npm test`: **46/46 PASS**, gồm kiểm tra channel voice vẫn giữ scope/Manual và audit. `test:home-ui`, `test:gas-ui` và `test:remote-ui` PASS sau khi tách điều khiển khỏi cấu hình ngưỡng. Test remote dùng mock SpeechRecognition, không phải ghi âm/nhận dạng thực; đã thử preview/confirm/cancel, micro bị từ chối, câu không hỗ trợ, ACK, offline, mobile và viewer. Docker MQTT build/runtime healthy; remote.js, remote.css và /app HTTP 200. Micro thật trên điện thoại/HTTPS vẫn cần thực nghiệm. Hướng dẫn [REMOTE-CONTROL](REMOTE-CONTROL.md).

## Bổ sung gas — 14/11/2026

`npm test`: **45/45 PASS** (40 test cũ + 5 test gas). Browser admin và Home PASS; `npm run test:gas-ui` PASS cho ngưỡng gas, telemetry, Home mobile và viewer. Docker MQTT đã build lại và app/Mongo healthy; health API, gas.js và gas.css trả HTTP 200. Các thử nghiệm gas dùng ADC/ACK giả lập trong DB test; chưa xác minh còi/ESP32 thật. Xem [GAS-ALARM](GAS-ALARM.md).

## Kiểm tra trước khi push main — 14/11/2026

- `npm test`: **40/40 PASS**, khoảng 33,4 giây, database test tạm riêng.
- `npm run build`: PASS. `node --check` cho launcher Docker và telemetry JS: PASS.
- `npm run test:ui`: PASS, gồm telemetry filter/biểu đồ/phân trang/realtime/mobile và luồng admin. Đã sửa một race trong test chờ DOM trước khi đọc computed style.
- `npm run test:home-ui`: PASS, gồm phân quyền, nhà/phòng/claim/invite và cache PWA.
- `npm run test:ai-ui`: PASS, gồm worker training/report và cảnh báo login.
- Audit nội dung stage: loại `.env`, `.env.mqtt-lab`, `firmware/**/secrets.h`, dữ liệu broker/runtime; quét không thấy giá trị credential local trong file chuẩn bị publish.
- Docker local đã build/chạy thành công trong phiên làm việc trước: app/MongoDB healthy, API/telemetry assets HTTP 200. MQTT lab host:1884 đã kết nối BE và nhận số đo MQTTX. Không coi đó là bằng chứng ESP32 thật hoặc bộ test ACL/ACK vật lý hoàn chỉnh.
- Firmware: chưa compile/nạp do chưa có Arduino CLI/PlatformIO hoặc board tại lần kiểm tra. HTTPS/TLS công khai, firmware protocol và profile đa cảm biến vẫn cần hoàn thiện theo [CURRENT-STATUS](CURRENT-STATUS.md).

## Kiểm tra ban đầu — 13/11/2026

Ngày: **13/11/2026 (Asia/Saigon)**. Chạy từ gốc repo sau khi chuyển code sang backend/frontend/database và sửa đường dẫn build/runtime/import. Working tree chưa commit tại thời điểm kiểm tra; không gắn kết quả này cho commit cũ trên remote.

| Lệnh | Kết quả thực tế |
| --- | --- |
| `npm test` | PASS: 40 test, 0 fail; khoảng 62,9 giây |
| `npm run build` | PASS: Tailwind xuất `frontend/public/assets/app.css` |
| `npm run test:ui` | PASS: 10 màn admin; onboarding/config/command ACK, quyền viewer, CSV, WebSocket, mobile |
| `npm run test:home-ui` | PASS: nhà/phòng/claim/invite/revoke, operator/viewer, offline/reconnect và cache PWA |
| `npm run test:ai-ui` | PASS: worker train, report/biểu đồ, cảnh báo login/review, lịch sử riêng tư, phân quyền, mobile |
| `npm run ai:demo` | PASS: xuất JSON synthetic; sensor precision 0,778/recall 1/F1 0,875; login fixture F1 1 |
| Docker build/Compose/runtime | NOT RUN: không tìm thấy Docker CLI trong PATH hoặc vị trí Docker Desktop tiêu chuẩn |
| ESP32 thật, MQTT/TLS/ACL và đầu ra vật lý | NOT RUN trong lần kiểm tra này |
| Atlas cá nhân | Không được dùng để kiểm thử lần này |

Test backend dùng MongoDB tạm riêng bằng mongodb-memory-server; browser dùng ứng dụng và DB test riêng. ACK/dữ liệu trong các test này là test fixture/mô phỏng, không phải cảm biến/quạt vật lý. RNN worker chạy thật trên dữ liệu demo; điều đó không chứng minh độ chính xác trên cảm biến thật.

Screenshot kiểm tra local nằm ở `.artifacts/` và được Git ignore. Kết quả AI synthetic đã lưu vào [experiments/ai-synthetic-report.json](experiments/ai-synthetic-report.json); lần chạy mới bằng npm ghi vào `.artifacts/ai-demo-report.json`.

Đối với các lần thử thực tế tiếp theo, dùng mẫu sau cho từng ca trong TEST-PLAN và D01–D06:

| Ca | Mã nguồn/firmware version | Thời điểm và môi trường | Expected | Actual | PASS/FAIL/BLOCKED/N/A | Minh chứng |
| --- | --- | --- | --- | --- | --- | --- |
| Điền ID ca | Commit + dirty/clean; phiên bản board | Broker/DB/container, không ghi secret | Điều kiện cần đạt | Số đo/log quan sát được | Chỉ đánh dấu sau khi thử | Đường dẫn ảnh/video/log đã che credential |

Không biến mục NOT RUN thành PASS chỉ vì đã có mã nguồn hoặc cấu hình. Bộ kết quả này phục vụ phần mềm; cần bổ sung minh chứng thiết bị thật, triển khai và các phép đo để hoàn tất bài nộp.
