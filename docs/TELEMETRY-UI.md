# Trang Dữ liệu cảm biến

Admin mở `/#telemetry`. Dùng lại Chart.js đã có, không thêm thư viện giao diện.

- Thẻ tóm tắt dùng số đo gần nhất theo thiết bị được chọn. Một node climate chỉ có nhiệt độ, độ ẩm và nguồn dữ liệu/broker; không tạo thẻ ánh sáng giả. Khi chọn nhiều node, tên/thời gian của node cung cấp số đo được hiển thị.
- Phân biệt số đo mới với lần đo cuối khi stale/offline. Chế độ demo ghi rõ mô phỏng, không hiển thị như broker/ESP32 thật.
- Khoảng 1/6/24 giờ hoặc 7 ngày là các nút có aria-pressed; dropdown chọn thiết bị. Tìm kiếm theo tên/ID ảnh hưởng bảng và biểu đồ, không ảnh hưởng thẻ số đo gần nhất.
- Mỗi node/chỉ số có đường riêng; trục °C tự co giãn, trục % 0–100. Điểm cách nhau trên 60 giây bị ngắt đường; vẫn hiện dấu chấm cho dữ liệu lịch sử thưa. Biểu đồ lấy tối đa 250 số đo mỗi đường cùng dấu ngắt khoảng trống; đây không phải tổng hợp min/max nên không dùng biểu đồ rút gọn để khẳng định không có spike.
- Bảng chỉ hiện cột thuộc profile đã chọn, giá trị không có được làm mờ. Header cố định trong vùng cuộn; tối đa 25/50 dòng DOM mỗi trang.
- Phân trang trên tối đa 1.000 bản ghi API đã tải, chưa phải phân trang toàn bộ DB. UI ghi rõ giới hạn. CSV giữ API hiện có: tối đa 2.000 dòng theo node/khoảng giờ, không áp dụng tìm kiếm văn bản.
- Khi đọc trang 2 trở đi, giữ snapshot bảng để bản ghi mới không đẩy vị trí đọc; thẻ/biểu đồ vẫn cập nhật. Bấm Về mới nhất để về dữ liệu mới. Đổi bộ lọc đưa về trang 1.
- Dòng mới ở trang 1 được tô xanh nhẹ; tôn trọng prefers-reduced-motion. Các bản ghi tải lần đầu hoặc đổi bộ lọc không bị coi là sự kiện mới.

Mã giao diện: `frontend/public/assets/telemetry.js`, tích hợp từ `app.js`; CSS riêng tại `frontend/public/assets/telemetry.css`, CSS chung build từ `frontend/styles.css`. URL tài nguyên có version và static assets revalidate; service worker ưu tiên mạng để tránh CSS cũ lệch với JavaScript mới. Không sửa API/phân quyền/firmware hay dữ liệu MongoDB trong tính năng này.

Kiểm tra bằng `npm run build` và `npm run test:ui`: bộ lọc climate/lighting/all, số series/cột, 25/50 dòng, giữ trang cũ qua realtime, dòng mới, nhiệt độ vượt trục cũ, mobile không tràn trang và các luồng admin cũ. Chạy `npm run docker:build` để cập nhật image demo local sau khi sửa code.
