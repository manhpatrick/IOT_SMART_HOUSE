# Các trường hợp lỗi và cách xử lý

| Tình huống | Backend | Web/app |
| --- | --- | --- |
| Điện thoại mất Internet | Không có offline command queue | Hiện banner, thời điểm đồng bộ cuối; khóa thao tác; reconnect không tự phát lại lệnh |
| Server không phản hồi / request timeout | Lệnh có thể đã được tạo; tra command history và trạng thái báo về | Báo kết quả chưa xác định, yêu cầu kiểm tra trước khi gửi lại; giữ bản đọc cũ trong bộ nhớ tab |
| Websocket đứt nhưng HTTP còn | Ping/pong loại socket chết | Tự kết nối lại có backoff, đồng thời refresh HTTP mỗi 10 giây khi app hiển thị |
| MQTT broker mất kết nối | MQTT.js reconnect mỗi 3 giây; từ chối lệnh mới | Phân biệt broker lỗi với node offline; node có trạng thái kết nối chưa xác định |
| Node mất Wi-Fi/nguồn | Status/LWT hoặc hết heartbeat mặc định 35 giây → offline; cảnh báo một đợt, không tạo trùng liên tục | Khóa điều khiển, giữ lịch sử và số đo cuối cùng có nhãn thời gian |
| Node trở lại | Heartbeat/telemetry hợp lệ cập nhật last_seen và kết thúc cảnh báo offline | Tải trạng thái thực tế mới; không phát lại lệnh cũ |
| Heartbeat còn nhưng cảm biến không gửi dữ liệu | data_status=missing/stale, mặc định quá 60 giây; cảnh báo stale | Gắn nhãn dữ liệu cũ/thiếu, loại khỏi trung bình hiện tại |
| Sensor báo fault | Giữ fault đến status explicit `fault:null`; số đo mới/heartbeat thiếu trường fault không tự xóa lỗi | Hiện lỗi trên thẻ node, giữ lịch sử cảnh báo |
| Dữ liệu trùng QoS 1 | Unique device_id + boot_id + seq → bỏ trùng | Không vẽ/đếm trùng |
| Gửi bù / sai thứ tự | Giữ lịch sử; bản cũ không cập nhật output state hay sinh cảnh báo nhiệt độ hiện tại | Chọn latest theo recorded_at, không theo thứ tự nhận |
| Timestamp sai/ngoài khoảng, số đo thiếu/sai kiểu/vượt giới hạn, ID lệch topic | Reject, không ghi sensor record; MQTT audit không lưu raw payload/secret | Không hiển thị số đo lỗi như dữ liệu hợp lệ |
| Chỉnh ngưỡng không hợp lệ | Reject 400; fanOff < fanOn ≤ temperatureAlert; lightOn < lightOff | Hiện lỗi trong form, giữ giá trị người dùng nhập |
| Hai lệnh đồng thời | Một pending/device, yêu cầu sau trả 409 | Chờ ACK; khóa công tắc và config khi đang có lệnh |
| Node báo thất bại | Command failed, không cập nhật config mong muốn thành đã áp dụng | Hiện lịch sử thất bại |
| ACK sai node, trùng hoặc quá hạn | Không áp dụng vào thiết bị; ACK đúng hạn đã ghi nhận được đối soát lại nếu DB lỗi | Chưa báo thành công trước khi trạng thái được lưu |
| Quá 15 giây chưa có ACK | Timeout, không tự resend; firmware phải kiểm tra expiresAt | Nêu rõ chưa xác định chắc kết quả, xem output báo về trước khi thao tác tiếp |
| Khóa/bảo trì/ngừng sử dụng | Thu hồi MQTT theo vòng đời, hủy pending command; không nhận telemetry từ node không active | Không cho gửi lệnh; lịch sử còn để xem |
| Mã claim sai/hết hạn/đã dùng, node đã có chủ | Reject, không ghi đè chủ sở hữu; kiểm tra room thuộc target home | Báo lỗi, cho nhập lại mã |
| Invite sai email/hết hạn/revoked/đã dùng | Reject; mã lưu hash, chỉ nhận viewer trong đúng nhà | Không tự gia nhập/đổi vai trò |
| Viewer bị thu hồi hoặc user bị khóa | Scope kiểm tra mỗi request; user disable thu hồi session | Tải lại phạm vi nhà; user hết phiên về login |
| MongoDB mất kết nối | Không buffer query; lỗi mạng DB trả 503; chu kỳ IoT thử lại khi DB trở lại | Hiện lỗi, không giả báo lưu thành công |

## Trách nhiệm firmware chưa được thay thế bằng backend

Firmware phải reconnect Wi-Fi/MQTT với backoff; publish heartbeat và LWT; đọc cảm biến có kiểm tra lỗi; giữ bootId/seq; lưu cấu hình vào NVS; xử lý Auto tại node; kiểm tra commandId/expiresAt; ACK sau khi thực hiện; gửi lại trạng thái thực tế sau reconnect. Bộ đệm cảm biến nếu có phải giới hạn dung lượng và giữ timestamp đo gốc.

Backend không thể tự phát hiện motor thực sự quay chỉ từ việc GPIO đã bật. Cần phản hồi phần cứng tương ứng nếu muốn xác minh điều đó. ACK hiện biểu thị firmware đã áp dụng đầu ra/cấu hình theo hợp đồng.

Các hành vi trên được kiểm thử phần mềm bằng simulator và mongod tạm. Vẫn phải có kiểm thử MQTT/TLS/ACL/reconnect trên broker và ESP32 thật, kèm bằng chứng đầu cuối; test phần mềm không thay thế minh chứng phần cứng.
