# Kịch bản demo thi — NODO, một ESP32

Cập nhật 14/11/2026. Bộ này thay thế các kịch bản cũ yêu cầu chọn Auto/Manual, admin mở web operator, app điện thoại hoặc nút thử dữ liệu AI.

## 1. Phạm vi và điều kiện phải chốt

- Web desktop: admin quản trị/bàn giao/giám sát; operator quản lý nhà và điều khiển; viewer chỉ xem nhà được mời.
- Một ESP32 climate có DHT nhiệt độ/độ ẩm, LDR ánh sáng và MQ-2 gas; đầu ra quạt/đèn/còi. Cả node thuộc một phòng, không gán từng cảm biến vào phòng khác nhau.
- Bàn giao bằng mã claim. Admin không gán trực tiếp owner/viewer/nhà; viewer tham gia bằng lời mời của operator.
- Điều khiển tay và tự động cùng hoạt động. Lệnh tay đã ACK giữ tối đa 5 phút; cảnh báo nhiệt/gas ưu tiên. Không demo việc chọn mode.
- Admin xem nhà và nhật ký theo chủ nhà ngay trong console, không có trang AI hoặc giao diện vận hành của operator.
- AI gồm Elman RNN cảm biến và KDE giờ đăng nhập. Login được seed 32 sự kiện/8 ngày mỗi operator/viewer, sau đó học cùng login thật; lịch sử hiển thị chỉ các login quan sát được. Không gọi seed là lịch sử người dùng thật.
- Firmware trong repo vẫn legacy: cần đúng MQTT-CONTRACT và HYBRID-CONTROL, compile/flash và kiểm chứng board trước. Ca nào chưa đủ firmware/phần cứng phải ghi BLOCKED; MQTTX không thay bằng chứng actuator/cảm biến thật.

## 2. Checklist chuẩn bị trước hôm thi

- [ ] Chốt commit, trạng thái working tree, phiên bản firmware, thư viện, board/GPIO và cấu hình ngưỡng.
- [ ] Broker Mosquitto Dynamic Security ở laptop:1884 hoạt động. Backend và ESP32 dùng credential riêng; giữ bí mật khỏi màn hình quay.
- [ ] ESP32 dùng IP LAN của laptop, không dùng localhost/host.docker.internal. Kiểm tra IP khi đổi Wi-Fi/hotspot, firewall và nguồn mạch.
- [ ] Một Device ID xuyên suốt, ví dụ hw-climate-01. Dừng MQTTX cùng clientId trước khi bật board.
- [ ] Firmware có NTP/timestamp/bootId/seq, heartbeat/LWT, ACK, kiểm tra expiresAt, chống trùng và chạy rule local khi mất mạng.
- [ ] Có admin, operator A, viewer A; operator B/nhà B chỉ dùng thử truy cập chéo. Mở các browser profile riêng.
- [ ] Operator A đã có nhà/phòng hoặc tạo live. Provision và nạp credential trước buổi; nếu demo claim live, để node chưa có chủ và board tắt trước khi nhận.
- [ ] Nếu node đã claim, không xóa/reset quyền chỉ để diễn lại. Dùng luồng vận hành và giải thích lịch sử bàn giao đã thực hiện.
- [ ] Thu dữ liệu RNN trước: ít nhất 360 bucket 10 giây hợp lệ, khoảng một giờ dữ liệu đều; chọn đoạn bình thường và train trước. Dữ liệu seed login không train được RNN cảm biến.
- [ ] Mở sẵn report RNN, biểu đồ KDE và một kết quả login đã lưu; không đợi thu một giờ dữ liệu trên sân khấu.
- [ ] Ghi ngưỡng ban đầu và tình trạng quạt/đèn/còi để khôi phục. Không để command pending trước khi bắt đầu.
- [ ] Tập trọn luồng hai lần; quay video dự phòng đúng nguồn dữ liệu. Ghi PASS/FAIL/BLOCKED/N/A theo quan sát thực tế.

Chia bốn người: BE giữ Docker/broker/admin; hai bạn phần cứng giữ Serial và theo dõi mạch/đầu ra/mạng; bạn còn lại trình bày, thao tác operator/viewer và ghi bằng chứng.

## 3. Khởi động

Mở Docker Desktop; giữ broker lab chạy riêng. Tại gốc repo:

    cd C:\Users\Admin\Documents\simple-web\iot-admin
    npm.cmd run docker:mqtt

Nếu sửa code, build trước giờ thi bằng npm.cmd run docker:mqtt:build. Không chạy thêm npm run dev cùng cổng. Không dùng docker:up trong lượt ghép board vì lệnh đó bật giả lập.

- Admin: http://127.0.0.1:3080/
- Operator/viewer: http://127.0.0.1:3080/app
- Health: http://127.0.0.1:3080/api/health

Phân biệt: app healthy, backend kết nối broker, node online là ba trạng thái khác nhau. Kiểm tra HARDWARE MODE, MQTT kết nối, đúng node và thời điểm số đo mới.

## 4. Luồng trình bày chính, khoảng 15–20 phút

Thời lượng chỉ để tập, không phải kết quả đo đã đạt. Mỗi bước cần nói vấn đề nghiệp vụ và chỉ ra bằng chứng.

| Ca | Thời lượng | Thao tác | Kết quả cần thấy / câu trình bày |
| --- | --- | --- | --- |
| D01 | 1 phút | Admin mở Docker/health/Cài đặt, giới thiệu sensor → ESP32 → MQTT → BE → MongoDB/web | App/Mongo healthy; broker riêng; đây là triển khai Docker, không cần npm dev. AI worker nằm trong app |
| D02 | 1 phút | Operator mở nhà/phòng; admin mở danh sách tài khoản | Operator là chủ nhà, viewer chỉ xem; tên hệ thống khác tên nhà/phòng |
| D03 | 2 phút | Admin mở node Chưa bàn giao, tạo mã nhận; operator nhập mã và chọn phòng; admin kích hoạt nếu chưa active; bật board | Node thuộc đúng nhà/phòng. Credential MQTT dùng cho firmware, tài khoản web dùng cho người, claim code chứng minh quyền nhận. Provision đã làm trước thì trình bày lịch sử, không giả là thao tác live |
| D04 | 1 phút | Đối chiếu DHT/LDR/gas trên Serial với cùng node trên web; lọc node và xuất CSV | Một ESP32 có đủ ba nhóm; giá trị/time/đơn vị khớp. Gas ADC chưa phải ppm, ánh sáng % chưa phải lux |
| D05 | 1–2 phút | Operator gửi ngưỡng đèn/quạt, chờ ACK; che/chiếu LDR và kiểm tra rule quanh nhiệt độ thực | Cấu hình chưa thành công trước ACK. Đèn/quạt thật đổi theo ngưỡng, khoảng hysteresis giữ trạng thái |
| D06 | 1–2 phút | Operator bật/tắt từ trang Điều khiển; nói một câu voice, xem trước rồi xác nhận | Không chọn Manual. Chỉ sau ACK mới báo áp dụng. Voice chưa xác nhận không gửi lệnh; lệnh tay được giữ theo lease 5 phút, không bị rule thường ghi đè ngay |
| D07 | 2 phút | Thử quy tắc gas bằng ngưỡng quanh ADC nền; đọc cảnh báo, xác nhận rồi phục hồi ngưỡng | Còi thật + ACK; khi gas còn cảnh báo, tắt còi bị chặn. Xác nhận chỉ nghĩa đã tiếp nhận, không hết sự cố |
| D08 | 1 phút | Ngắt Wi-Fi/nguồn board rồi khôi phục, BE/broker vẫn chạy | Offline sau LWT/timeout theo cấu hình; không gửi được lệnh. Trở lại có heartbeat/số đo mới, không phát lại lệnh cũ |
| D09 | 2–3 phút | Operator mở RNN Kết quả & đánh giá của đúng node | Giải thích nguồn/tiền xử lý/model/train/metric/thử nghiệm/tích hợp. Xem chia tập, loss, forecast trên test, MAE so baseline, score/ngưỡng; không khẳng định RNN luôn tốt hơn baseline |
| D10 | 1–2 phút | Operator mở Biểu đồ học đăng nhập, đăng xuất/đăng nhập lại và Chi tiết đánh giá | KDE học tự động từ lịch sử trước login; xem histogram/KDE/score-ngưỡng. Sự kiện mới đúng user/time; seed phục vụ khởi tạo, không phải tất cả là login thật |
| D11 | 1 phút | Viewer xem nhà và thử API điều khiển đã chuẩn bị; chủ nhà thu hồi quyền nếu đủ thời gian | Xem được số đo/cảnh báo, lệnh bị 403; thu hồi có hiệu lực ở API tiếp theo. Viewer chỉ xác nhận cảnh báo login của chính mình |
| D12 | 1 phút | Admin khóa node và thử reconnect bằng credential node; sau đó mở khóa | Broker từ chối kết nối khi khóa; admin không điều khiển đầu ra. Mở khóa và nhận heartbeat lại nếu tiếp tục |
| D13 | 1 phút | Admin mở Chi tiết nhà và Nhật ký, chọn tên nhà kèm chủ operator | Log chỉ đúng nhà được chọn; thấy ai nhận node, chỉnh ngưỡng, gửi lệnh và thời điểm. Không có khái niệm nhà của admin |
| D14 | 30 giây | Đăng xuất các role đang trình diễn | Về login; phiên cũ gọi API được bảo vệ bị 401 |

## 5. Những lượt cần chuẩn bị kỹ

### Gas/nhiệt và trạng thái cảnh báo

1. Đọc số đo nền ổn định từ sensor thật. Lưu ngưỡng cũ.
2. Đặt ngưỡng hợp lệ quanh số đo nền để thử quy tắc, chờ ACK và số đo mới. Nói rõ đây là kiểm thử ngưỡng, không chứng minh rò gas thực.
3. Quan sát cảnh báo và đầu ra; xác nhận đã đọc. Cảnh báo open là chưa tiếp nhận; acknowledged là đã tiếp nhận; resolved là điều kiện đã hết.
4. Phục hồi ngưỡng sao cho số đo mới đạt điều kiện kết thúc; với gas phải xuống đến gasClearThreshold. Còi chỉ được giải phóng khi đủ chính sách nhiệt/gas/fault.
5. Không tạo rò khí/lửa để demo. Nếu inject MQTTX thì ghi đó là thử giao thức; không gọi là số đo vật lý.

### Điều khiển tay cùng tự động

- Tập riêng ít nhất một lượt chờ đủ 5 phút: ACK lệnh tay → giữ trạng thái → hết lease → trở lại rule. Khi thi có thể dùng video/biên bản lượt này, không sửa đồng hồ hay claim đã chờ nếu chưa chờ.
- Cảnh báo nhiệt/gas có thể ưu tiên trước khi hết lease. Không để lời trình bày thành người dùng được tắt mọi bảo vệ.
- Firmware phải thực thi automaticEnabled/manualOverrideSeconds/safetyPriority. Chỉ có BE/simulator pass chưa chứng minh board đã thực hiện.

### AI cảm biến — RNN

- Chuẩn bị dữ liệu đúng node, biết nguồn; nhãn hardware chỉ nói chế độ nhận MQTT, không tự chứng minh là sensor thật.
- Chuỗi nhiệt độ/độ ẩm → bucket 10 giây → cửa sổ 12 mẫu; chia train/validation/test theo thời gian, scaler train-only.
- Model Elman RNN, không phải LSTM; gas/đèn dùng rule, không thuộc feature RNN hiện tại.
- Report có loss/MAE/RMSE/baseline. Hai bucket score bất thường liên tiếp tạo alert, ba bucket normal kết thúc; một spike đơn lẻ chưa đủ.
- Cảnh báo RNN nằm trong trang Cảnh báo để tiếp nhận; trang AI để phân tích model/biểu đồ.
- Không có nhãn độc lập thì không tự công bố precision/recall/F1 thực tế. Không có model/dữ liệu thì trình bày BLOCKED hoặc báo cáo synthetic có nhãn nguồn.

### AI đăng nhập — KDE

- Đây là mô hình phân bố giờ, không có epoch/loss như RNN. Seed một lần 32 sự kiện/8 ngày mỗi operator/viewer, rồi kết hợp login thật; metadata nguồn vẫn giữ trong DB.
- Lịch sử user chỉ hiện login đã quan sát với thời gian/người đăng nhập; seed không giả thành các lần đăng nhập thực trên bảng này.
- Histogram thể hiện mẫu giờ đã lọc/khử trùng; đường KDE thể hiện mật độ; Chi tiết đánh giá dùng snapshot lưu khi login, không phải đánh giá lại giờ mở trang.
- Login giờ hiện tại có thể normal hoặc anomaly: đối chiếu score với threshold, không hứa mọi lượt demo đều sinh alert.
- Muốn tái hiện cả giờ quen/giờ hiếm, dùng test cô lập hoặc npm.cmd run ai:demo và ghi synthetic. Không sửa giờ máy, không chèn thêm login giả vào runtime ngoài seed đã công bố.
- Chính chủ xác nhận Đây là tôi/Không phải tôi; không tự khóa user. Đây là phát hiện giờ khác thường, không chứng minh xâm nhập.

## 6. Phân biệt cảnh báo

| Loại | Điều kiện mở | Điều kiện kết thúc / thao tác |
| --- | --- | --- |
| Nhiệt độ | Số đo mới đạt temperatureAlert | Số đo mới xuống dưới ngưỡng; acknowledge không tự tắt quạt/còi |
| Gas | Gas mới đạt gasThreshold | Gas mới ≤ gasClearThreshold; vùng giữa vẫn giữ đợt |
| Offline | Node active mất heartbeat/LWT | Heartbeat/kết nối mới; khác broker mất kết nối |
| Stale | Còn heartbeat nhưng thiếu số đo quá thời hạn cấu hình | Số đo mới hợp lệ |
| Fault | Firmware báo lỗi | Firmware xác nhận phục hồi bằng fault:null |
| RNN | Hai bucket bất thường liên tiếp | Ba bucket normal; không tự gửi lệnh |
| Giờ login | Score KDE vượt ngưỡng của user | Luồng account riêng, chính chủ review; không dùng resolved của alert thiết bị |

Admin xem cảnh báo thiết bị toàn hệ thống, operator xem nhà mình. Một alert thiết bị dùng chung: người này xác nhận thì người kia cũng thấy đã xác nhận. Cảnh báo cần xử lý hiện đếm open; acknowledged không có nghĩa đã sửa xong. Chưa có email/push khi đóng web.

## 7. Ca cần test trước thi

Các ca T/A/S chi tiết ở TEST-PLAN.md. Ghi kết quả vào DEMO-RESULTS.csv; tất cả mặc định NOT_RUN, không mặc định PASS từ việc đã có code.

Nếu chỉ có 8–10 phút: ưu tiên D01, phần bàn giao đã chuẩn bị của D03, D04, D06–D07, report D09, bằng chứng D10, D11 và D13. Kịch bản lỗi/lease 5 phút train/khóa-thu hồi để tập trước hoặc mở khi được hỏi. Không bỏ AI khỏi phần trình bày nếu dùng nó làm hướng nâng cao.

## 8. Bằng chứng và phương án dự phòng

- Quay board/ID/Serial và web trong cùng luồng: số đo → rule/lệnh → ACK → đầu ra thật. Che mọi password, credential và mã claim.
- Mỗi ca ghi commit/dirty, firmware, ngày giờ, môi trường hardware/MQTTX/simulator/synthetic, actual, trạng thái và ảnh/video/log.
- Đo ít nhất 20 lần command → ACK/output; báo min/median/p95/max. Đo offline/reconnect và chạy ổn định 30–60 phút theo số liệu thực.
- Không xóa DB/khởi tạo lại credential để chữa lỗi ngay trên sân khấu. Decommission chỉ thử cuối cùng trên node lab không còn cần dùng.
- Nếu firmware chưa ghép: MQTTX thử nhận telemetry/command/ACK được, nhưng đầu ra vật lý và Auto local phải BLOCKED. Không đổi sang simulator rồi trình bày như ESP32 thật.
- Video dự phòng ghi nguồn/ngày thử rõ ràng, không thay cho minh chứng vật lý bắt buộc.

Tham chiếu: [MQTT-CONTRACT](MQTT-CONTRACT.md), [HYBRID-CONTROL](HYBRID-CONTROL.md), [ONE-NODE-MULTISENSOR](ONE-NODE-MULTISENSOR.md), [AI-GUIDE](AI-GUIDE.md), [CURRENT-STATUS](CURRENT-STATUS.md).
