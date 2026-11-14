# Điều khiển từ xa và micro cho operator

**Quyền hiện hành:** trang điều khiển chỉ dành cho operator có quyền quản lý nhà; admin không được điều khiển actuator hoặc đổi Auto/Manual. Admin không có tab/nút điều khiển, URL trực tiếp bị chuyển về giám sát; API manual/voice trả 403. Các mô tả trước đây admin cũng điều khiển được đã được thay bằng chính sách này. Giao diện hiện chỉ web desktop.

Mở **`/app#control`**, chọn nhà và thiết bị. Trang dành cho operator có quyền quản lý nhà đó; admin cũng dùng được khi giám sát nhà. Viewer không có mục điều khiển, URL trực tiếp không mở được console; API vẫn kiểm tra vai trò/phạm vi/CSRF.

## Phân chia màn hình

- Tổng quan/Thiết bị: xem số đo, gas, trạng thái đầu ra xác nhận, lịch sử và sắp xếp phòng. Không còn công tắc bật/tắt tại card.
- Chỉnh ngưỡng cảm biến: chỉ ngưỡng quạt/nhiệt/gas/đèn theo profile; không đổi Auto/Manual ở dialog này.
- Điều khiển: chọn node, chuyển Auto/Manual, bật/tắt quạt/còi hoặc đèn đúng profile, micro, nhập câu lệnh và lịch sử node.

Đổi Manual phải chờ ACK trước khi bật/tắt. Chuyển chế độ dùng API config hiện có, giữ các ngưỡng đã lưu. Lệnh actuator dùng API commands hiện có; một pending/node, thời hạn 15 giây. Không đổi công tắc/trạng thái thành thành công ngay khi gửi request. Gas còn báo động vẫn chặn tắt còi; voice không vượt qua ràng buộc này.

## Voice

Bấm micro để mở một lượt nhận dạng tiếng Việt (`vi-VN`), có thể bấm lại để dừng. Nhận dạng chỉ điền văn bản, **không tự gửi lệnh**. Bấm Xem trước lệnh → kiểm tra tên node/nhà và thao tác → Xác nhận gửi lệnh. Hủy/Escape không tạo lệnh.

Các mẫu hỗ trợ: bật/tắt quạt, bật/tắt đèn, bật/tắt còi (hoặc còi báo động), chuyển sang thủ công/tự động. Parser cố định, bỏ dấu/chữ hoa/dấu câu, không gọi LLM. Không hiểu câu mơ hồ, không đổi ngưỡng bằng voice trên trang này. Câu lệnh áp dụng cho node đã chọn, không tự tìm theo tên phòng nói trong câu. Đầu ra không thuộc profile bị từ chối.

Có thể nhập hoặc bấm câu mẫu khi không có micro. SpeechRecognition chỉ có trên một số trình duyệt. Micro trên điện thoại cần HTTPS hợp lệ và quyền micro; HTTP IP LAN chỉ dùng các nút/nhập lệnh. Localhost trên laptop có thể thử trong secure context. Một số trình duyệt gửi âm thanh tới dịch vụ nhận dạng, cần Internet; ứng dụng không lưu âm thanh hay transcript vào DB. Metadata channel=voice chỉ là nguồn thao tác do client khai báo, không phải chứng cứ đã dùng micro.

Khi mất mạng/đổi nhà/đổi node/đổi trang/ẩn ứng dụng thì dừng micro. Không xếp hàng lệnh offline hay tự gửi lại khi reconnect. Lúc xác nhận kiểm tra lại context node/nhà và quyền/kết nối; server quyết định cuối cùng. Command có source voice và audit voice_actuator/voice_config; payload MQTT gửi cho firmware giữ định dạng actuator/config cũ.

## Kiểm thử

`npm run test:remote-ui` dùng mock SpeechRecognition để kiểm tra nhận văn bản, preview/confirm/cancel, lỗi quyền micro, lệnh không hỗ trợ, ACK, offline, mobile và viewer. Đây là test luồng ứng dụng, **không chứng minh chất lượng nhận giọng nói thực**. `npm test` có kiểm tra voice channel giữ quyền, không bypass Manual và source/audit.

Cần thử thêm micro thật trên điện thoại/trình duyệt của nhóm, qua HTTPS, giọng nói thật và lệnh với ESP32 thật. Không cần sửa firmware chỉ vì thêm giao diện voice nếu firmware đã đáp ứng MQTT-CONTRACT; firmware legacy hiện trong repo vẫn cần sửa transport/ACK như review đã ghi.

Tham khảo: [SpeechRecognition và giới hạn trình duyệt](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [continuous=false](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/continuous).
