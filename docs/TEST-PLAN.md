# Kế hoạch test trước hôm thi — nghiệp vụ hiện tại

Đọc [DEMO-RUNBOOK](DEMO-RUNBOOK.md) để tập trình bày. Bộ này thay thế các ca cũ yêu cầu chọn mode hoặc demo mobile.

## Cách thực hiện

- Chạy 14 ca D01–D14 trong runbook, sau đó các ca dưới đây trong môi trường lab.
- Ghi expected/actual, commit/dirty, firmware, thời điểm, nguồn môi trường và bằng chứng trong [DEMO-RESULTS.csv](DEMO-RESULTS.csv).
- Firmware hiện chưa khớp contract: ca cần board/Auto local/lease/ACK phải BLOCKED đến khi sửa và thử đạt.
- Không dùng Atlas cá nhân, nhà thật của người khác hoặc xóa volume để thử lỗi.

## Độ tin cậy và dữ liệu

| Ca | Bước thử | Điều kiện đạt |
| --- | --- | --- |
| T01 | Mất nguồn/Wi-Fi node | Offline theo LWT/timeout; khóa điều khiển và không hiện đầu ra cũ như hiện tại |
| T02 | Khôi phục nguồn/Wi-Fi | Tự reconnect; heartbeat/số đo mới; không phát lại lệnh quá hạn |
| T03 | Giữ heartbeat nhưng ngừng telemetry | Online nhưng stale; có cảnh báo và không dùng số cũ như mới |
| T04 | Báo fault rồi gửi heartbeat không có fault | Lỗi giữ nguyên; chỉ fault:null sau phục hồi mới xóa |
| T05 | Không ACK lệnh lab | Timeout khoảng 15 giây; không báo thành công hoặc suy ra chắc chắn chưa tác động |
| T06 | ACK sau hạn hoặc sai node | Không chuyển lệnh thành applied |
| T07 | Firmware trả failed | Giữ cấu hình/trạng thái đã xác nhận trước; hiển thị lý do |
| T08 | Gửi trùng telemetry cùng bootId/seq | Chỉ một record/điểm dữ liệu, không nhân cảnh báo |
| T09 | Sai timestamp/ID/JSON hoặc giá trị ngoài miền | Reject toàn bộ mẫu; không ghi số hợp lệ giả |
| T10 | Hai tab gửi lệnh cùng node | Tối đa một pending; thao tác sau bị chặn/409 |
| T11 | Tắt mạng trình duyệt rồi bật lại | Không xếp hàng/gửi lại lệnh; tải dữ liệu mới sau reconnect |
| T12 | Ngắt WebSocket nhưng HTTP còn | Fallback polling và socket reconnect; không tự mất phiên |
| T13 | Dừng BE hoặc broker | Web báo đúng mất kết nối; firmware local tiếp tục bảo vệ nếu đã triển khai |
| T14 | Reset ESP32 sau cập nhật ngưỡng | BootId đổi/seq bắt đầu lại, cấu hình giữ theo NVS; cần firmware thật |
| T15 | Restart Docker không xóa volume | Tài khoản/nhà/telemetry/model giữ; không seed login lặp; không dùng down -v |
| T16 | Giữ lệnh tay đủ 5 phút | Không bị rule thường ghi đè ngay; hết lease quay lại tự động |
| T17 | Nhiệt/gas cảnh báo trong lease tay | Bảo vệ ưu tiên; tắt quạt/còi bị chặn theo điều kiện tương ứng |
| T18 | Gas dao động giữa hai ngưỡng | Giữ một đợt cảnh báo; thiếu/gas cũ không tự resolve |
| T19 | Retained online cũ khi board đã tắt | Không nhầm thành heartbeat mới; R18 cũ còn cần sửa/kiểm chứng, không mặc định PASS |
| T20 | Chạy 30–60 phút và đo 20 lệnh | Ghi reset/mất gói/timeout/độ trễ thực; không chọn riêng lần đẹp nhất |

## AI

| Ca | Bước thử | Điều kiện đạt |
| --- | --- | --- |
| A01 | Train RNN thiếu dữ liệu hoặc sai nguồn | Từ chối; không tạo model hardware giả |
| A02 | Train RNN đúng dữ liệu | Worker/model/report có nguồn, chia theo thời gian, loss/metric/baseline và test độc lập |
| A03 | Hai bucket bất thường rồi ba bucket normal | Mở một đợt ai_anomaly rồi resolve; không tự điều khiển đầu ra |
| A04 | Thiếu cửa sổ hoặc dữ liệu suy luận cũ | Warmup/stale rõ; không coi là normal hiện tại |
| A05 | Login seed và restart | 32 bản ghi bootstrap/user đúng một lần; login thực không bị ghi đè, lịch sử không hiện seed như login quan sát |
| A06 | Login giờ quen/hiếm trong test cô lập | KDE đúng vòng 24 giờ, score/ngưỡng và snapshot đúng thời điểm; không thay giờ runtime |
| A07 | Xác nhận login của chính chủ | expected có thể học tiếp; unrecognized loại khỏi baseline; người khác không review thay |
| A08 | Train/AI lỗi | Không chặn login đúng mật khẩu; retrain lỗi giữ model ready cũ; lỗi không bị coi là normal |

## Quyền và bàn giao

| Ca | Bước thử | Điều kiện đạt |
| --- | --- | --- |
| S01 | Viewer gọi API actuator/config/phòng/invite | 403; không chỉ kiểm tra ẩn nút |
| S02 | Operator B đọc/điều khiển node nhà A | 403, không rò telemetry/alerts/history |
| S03 | Admin gửi actuator manual/voice | 403; UI không có console vận hành; admin chỉ giám sát/lifecycle/ngưỡng |
| S04 | Admin gán owner/home/viewer trực tiếp | API từ chối; claim mới xác lập quyền nhận node |
| S05 | Mã claim sai/hết hạn/đã dùng; invite sai email | Không nhận node/nhà; mã đúng một lần, không chiếm node đã có chủ |
| S06 | Thu hồi viewer đang mở web | API kế tiếp mất quyền; không xóa tài khoản hệ thống |
| S07 | Tài khoản MQTT node vào topic node khác | Broker ACL chặn; kiểm chứng log/subscriber/DB, không dựa nút Publish thành công |
| S08 | Khóa/bảo trì/đăng xuất; decommission node lab | Vòng đời đúng, pending được hủy khi đổi; logout 401; decommission không bật lại được |

## Kiểm tra phần mềm

    npm.cmd test
    npm.cmd run test:ui
    npm.cmd run test:home-ui
    npm.cmd run test:remote-ui
    npm.cmd run test:gas-ui
    npm.cmd run test:ai-ui

Các test dùng DB/simulator biệt lập, không thay bằng chứng ESP32 thật. Kết quả đã chạy theo từng phiên ở [VALIDATION](VALIDATION.md), không tự điền PASS vào lượt thi mới.
