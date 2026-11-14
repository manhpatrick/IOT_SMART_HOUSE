# Kết quả kiểm tra sau khi sắp xếp repository

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
