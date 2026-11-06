# Danh sách chức năng admin — Smart Room, 2 node

Ký hiệu: `[x]` đã có trong base; `[ ]` công việc tích hợp hoặc mở rộng. Dữ liệu từ hai ESP32 đang được giả lập mặc định. Đọc phần giới hạn ở README trước khi dùng cho phần cứng thật.

## 1. Dashboard

- [x] Tổng số node, số node online, cảnh báo cần xử lý, số người dùng.
- [x] Dữ liệu cảm biến mới nhất, biểu đồ, trạng thái đầu ra.
- [x] Cập nhật qua WebSocket cùng origin, có xác thực phiên.
- [x] Hoạt động gần đây, điều hướng đến trang quản lý.
- [ ] Thống kê lưu lượng/mất bản tin, tài nguyên server và độ trễ đo được.

## 2. Người dùng

- [x] Admin tạo tài khoản, sửa tên/email, đặt lại mật khẩu.
- [x] Đăng nhập/đăng xuất/đổi mật khẩu cá nhân; băm bcrypt.
- [x] Ba vai trò Admin / Operator / Viewer.
- [x] Khóa/mở tài khoản; thu hồi phiên cũ khi thay đổi tài khoản.
- [x] Chặn tự khóa/tự hạ quyền và bảo vệ Admin cuối cùng.
- [x] Gán chủ sở hữu và người được xem cho từng node.
- [ ] Tự đăng ký, xác minh email, quên mật khẩu, MFA nếu cần.

## 3. Vòng đời thiết bị

Lưu vòng đời và kết nối thành hai thuộc tính độc lập. Thiết bị `active` có thể `offline` khi mất Wi-Fi; mất kết nối không đồng nghĩa bị thu hồi quyền.

| Trạng thái | Ý nghĩa | Chuyển tiếp được phép |
| --- | --- | --- |
| Registered | Đã đăng ký metadata | Provisioned, Decommissioned |
| Provisioned | Đã cấp thông tin kết nối | Active, Locked, Decommissioned |
| Active | Được vận hành | Maintenance, Locked, Decommissioned |
| Maintenance | Tạm bảo trì | Active, Locked, Decommissioned |
| Locked | Bị thu hồi quyền tạm thời | Active, Decommissioned |
| Decommissioned | Kết thúc vòng đời, giữ lịch sử | Không kích hoạt lại |

- [x] Device ID duy nhất, tên, loại node, vị trí, người phụ trách/quyền xem.
- [x] Theo dõi firmware, hardware, heartbeat, fault và online/offline.
- [x] Chuyển trạng thái có kiểm tra; lưu lịch sử người/thời gian thực hiện.
- [x] Cấp tài khoản node riêng, mật khẩu chỉ hiển thị một lần.
- [x] Adapter Mosquitto tạo role/client/ACL và disable/enable tài khoản.
- [x] Hủy lệnh đang chờ và từ chối telemetry khi khóa/ngừng sử dụng.
- [ ] Kiểm chứng lifecycle từ đầu đến cuối trên broker và ESP32 thật.
- [ ] Quy trình rotate credential, thay bo mạch, cấp lại khi thất lạc mật khẩu.
- [ ] Onboarding tự phục vụ/QR hoặc cấp cấu hình Wi-Fi qua giao diện nếu cần.

## 4. Dữ liệu

- [x] Topic theo từng device ID; schema và đơn vị được mô tả.
- [x] Kiểm tra kiểu/range, profile, timestamp, identity trên topic.
- [x] Chống trùng bằng `(device_id, boot_id, seq)`.
- [x] Lưu thời gian đo và thời gian backend nhận riêng.
- [x] Lọc node/khoảng thời gian, biểu đồ và CSV.
- [x] Retention telemetry định kỳ.
- [ ] Phân trang/cursor cho toàn bộ lịch sử; aggregate theo phút/giờ cho dữ liệu lớn.
- [ ] Offline buffer và đồng bộ lại ở firmware.

## 5. Điều khiển & cấu hình

- [x] Kiểm tra quyền sở hữu trước khi gửi lệnh.
- [x] Auto/Manual, ngưỡng bật/tắt có hysteresis.
- [x] Quạt/còi cho climate; đèn cho lighting; từ chối actuator sai profile.
- [x] Command ID, thời hạn 15 giây, lệnh MQTT không retained.
- [x] Pending → Applied / Failed / Timeout / Cancelled.
- [x] Chỉ ACK đúng node, đúng lệnh, còn hạn mới được áp dụng.
- [x] Cấu hình trong DB chỉ cập nhật khi ACK applied.
- [ ] Firmware thực thi idempotent, bỏ qua lệnh cũ và xác nhận lại khi nhận lệnh trùng.
- [ ] Đo độ trễ từ nhấn web đến node ACK.
- [ ] Cảm biến phản hồi đầu ra nếu cần xác minh thiết bị vật lý thực sự chạy. Hiện `applied` xác nhận firmware cập nhật đầu ra, không đo được quạt đang quay.

## 6. Cảnh báo

- [x] Nhiệt độ vượt ngưỡng, node mất heartbeat.
- [x] Lưu mức độ, nội dung, node và thời điểm.
- [x] Operator sở hữu/Admin xác nhận; lưu người và thời gian.
- [x] Hạn chế cảnh báo trùng trong 5 phút, kể cả vừa xác nhận.
- [ ] Tách đầy đủ acknowledge/resolved, tự đóng khi điều kiện phục hồi.
- [ ] Rule engine tùy ý, email/Telegram hoặc escalation nếu cần.

## 7. Bảo mật & vận hành

- [x] Session lưu trong MongoDB bằng connect-mongo, TTL index; cookie HttpOnly/SameSite, Secure khi production.
- [x] CSRF token cho các API thay đổi dữ liệu; kiểm tra origin đăng nhập.
- [x] Giới hạn thử đăng nhập; validate đầu vào; prepared statements.
- [x] RBAC và quyền từng thiết bị tại BE; không chỉ ẩn nút FE.
- [x] Audit log cho login, user, lifecycle, lệnh, cấu hình, cảnh báo, export.
- [x] Mongoose models và index duy nhất; validate đầu vào để chặn MongoDB selector injection.
- [x] Script chuyển SQLite cũ sang MongoDB, giữ file gốc và bỏ qua bản ghi đã tồn tại.
- [x] Không lưu mật khẩu MQTT plaintext; `.env` và dữ liệu local được ignore.
- [ ] Cấu hình HTTPS/MQTT TLS, ACL mặc định deny, tài khoản backend hạn chế đúng phạm vi vận hành.
- [ ] Kiểm thử broker từ chối publish/subscribe topic của node khác.
- [ ] Kiểm thử broker ngắt phiên đang kết nối ngay khi khóa node.
- [ ] Backup, restore, theo dõi dung lượng, log rotation và cảnh báo server.

## 8. Ma trận quyền

| Thao tác | Admin | Operator | Viewer |
| --- | --- | --- | --- |
| Xem thiết bị/telemetry | Toàn bộ | Sở hữu hoặc được chia sẻ | Được cấp quyền |
| Điều khiển/cấu hình | Toàn bộ | Thiết bị sở hữu | Không |
| Xác nhận cảnh báo | Toàn bộ | Thiết bị sở hữu | Không |
| Đăng ký/cấp quyền/khóa/ngừng sử dụng | Có | Không | Không |
| Gán chủ sở hữu/chia sẻ quyền xem | Có | Không | Không |
| Quản lý người dùng/nhật ký/cài đặt | Có | Không | Không |
| Đổi mật khẩu cá nhân | Có | Có | Có |

## 9. Phân công nhóm 4 người

- **Bạn — BE:** API, CSDL, xác thực/phân quyền, MQTT adapter, lifecycle, telemetry, command/ACK, cảnh báo, audit.
- **Phần cứng 1:** ESP32 climate, DHT11/DHT22, quạt/còi, Auto/Manual, MQTT reconnect/ACK.
- **Phần cứng 2:** ESP32 lighting, LDR/LED, Auto/Manual, MQTT reconnect/ACK.
- **FE:** phát triển từ giao diện HTML/Tailwind hiện có, tích hợp API, responsive, luồng demo và báo cáo phần UI.

## 10. Bằng chứng cần có khi nộp

- [ ] Hai board vật lý thực sự hoạt động, sơ đồ nối dây và ảnh mô hình.
- [ ] Demo đăng ký → cấp quyền → kích hoạt → nhận telemetry.
- [ ] Demo cấu hình và điều khiển có ACK; offline/reconnect; cảnh báo.
- [ ] Demo Viewer bị chặn điều khiển và truy cập thiết bị ngoài phạm vi.
- [ ] Demo khóa/ngừng sử dụng và broker từ chối kết nối lại.
- [ ] Số đo độ trễ, độ ổn định, mất/trùng bản tin và phục hồi mạng.
- [ ] ERD, use case, sequence telemetry/command, state machine lifecycle, ma trận quyền và threat model.
- [ ] GitHub theo thành viên, README, báo cáo, slide và tag bản nộp.
