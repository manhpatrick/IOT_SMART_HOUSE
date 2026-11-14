# Điều khiển từ xa cùng quy tắc tự động

Không còn chọn Auto/Manual trong giao diện. Operator bật/tắt đầu ra khi active/online, broker kết nối và không có lệnh pending. Cảnh báo cảm biến luôn chạy. Admin chỉ giám sát và quản lý lifecycle/cấu hình ngưỡng.

## Ưu tiên

1. Cảnh báo gas giữ còi bật; nhiệt độ cảnh báo ưu tiên quạt/còi. Không tắt còi khi gas còn cảnh báo, không tắt quạt/còi khi số đo nhiệt độ mới còn cảnh báo.
2. Lệnh tay đã được ACK giữ giá trị yêu cầu tối đa 300 giây theo từng đầu ra. Sau khi điều kiện cảnh báo hết, thời hạn còn lại của lệnh tay vẫn có hiệu lực.
3. Hết thời hạn, đầu ra trở lại các ngưỡng tự động/hysteresis đã cấu hình. Không tự phát lại lệnh quá hạn sau reconnect.

## Firmware phải cập nhật

Envelope command/config có `automaticEnabled: true`. Command actuator từ user/voice thêm `manualOverrideSeconds: 300`, `safetyPriority: true`; payload vẫn là `{actuator,value}`, expiresAt vẫn là hạn nhận lệnh 15 giây, không phải thời hạn giữ đầu ra.

Firmware cần giữ lease theo từng output, đọc cảm biến và chạy bảo vệ local kể cả mất Wi-Fi/server; áp dụng output rồi ACK đúng trạng thái. Nếu trạng thái yêu cầu xung đột cảnh báo tại node, trả failed, không ACK applied sai. Mode cũ trong config được giữ để tương thích dữ liệu/client trước; không được dùng để tắt toàn bộ rule khi envelope automaticEnabled=true. UI mới không phát lệnh chuyển mode.

BE lưu manual_overrides sau ACK, không áp dụng lạc quan; simulator đã chạy chính sách trên. Firmware legacy trong repo chưa có lease/envelope này, cần sửa/compile/flash và kiểm chứng thực tế; không khẳng định điều khiển vật lý đã hoàn thiện. Không cần xóa DB hoặc tạo lại node.
