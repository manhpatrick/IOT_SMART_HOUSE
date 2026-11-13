# Kế hoạch thử nghiệm NODO: web, MQTT và ESP32

Đây là danh sách cần chạy và ghi kết quả, không phải tuyên bố tất cả đã PASS. Bản code đã có test phần mềm trong `tests/`; ngày 14/11/2026 đã nhập firmware ESP32 nền nhưng còn lệch giao thức, xem [review](../firmware/REVIEW.md). Minh chứng phần cứng phải được nhóm thực hiện với broker và board thật.

## 1. Chuẩn bị và cách ghi kết quả

- **Phạm vi demo hiện chốt một ESP32 thật:** đề xuất `hw-climate-01` (DHT + quạt/còi). Các ca yêu cầu hai board hoặc LDR/LED riêng (E02/E04/E06) là phần mở rộng; đánh dấu N/A nếu không có phần cứng/profile tương ứng, không ghi PASS bằng dữ liệu giả. Các tham chiếu hai node ở dưới giữ để dùng khi mở rộng hoặc test mô phỏng có ghi nhãn riêng.
- Nếu mở rộng: node thứ hai `hw-light-01` (LDR + LED). Dùng ID mới để không nhầm hai node demo `node-01`, `node-02`. Gắn tất cả cảm biến vào một board cần profile kết hợp; schema climate hiện không nhận lightPercent.
- Một Mosquitto có Dynamic Security, một backend, MongoDB kết nối được; `DEMO_MODE=false`. Không chạy hai bản firmware với cùng MQTT clientId.
- Hai nhà A/B, operator A/B; viewer A. Người BE chuẩn bị tài khoản, nhà/phòng, provision và mã nhận thiết bị; người phần cứng giữ Serial Monitor và quan sát đầu ra thật.
- Đồng bộ giờ ESP32 bằng NTP. Ghi phiên bản firmware, commit code (`git rev-parse HEAD`), ngày giờ thử, cấu hình ngưỡng, Wi-Fi/broker dùng và test mode. Nếu đang có thay đổi chưa commit, ghi rõ working tree có thay đổi.
- Mỗi ca ghi: ID, bước đã làm, expected, actual, PASS/FAIL/BLOCKED, người thực hiện và đường dẫn ảnh/video/log. Không đánh dấu PASS chỉ vì endpoint HTTP 200.
- Dùng môi trường lab và node thử riêng cho ca dữ liệu lỗi, thu hồi hoặc decommission. Decommission là trạng thái cuối; muốn lặp ca này đăng ký ID mới.

## 2. Luồng chính — chạy trước

| ID | Thực hiện | Kết quả cần thấy |
| --- | --- | --- |
| E01 | Admin đăng ký node → provision → tạo mã claim; operator nhận vào phòng; admin kích hoạt | Đúng home_id/room_id; có tài khoản MQTT thật; node active. Mã claim khác mật khẩu MQTT |
| E02 | Hai ESP32 cùng kết nối bằng hai tài khoản/clientId riêng | Không đá nhau khỏi broker; mỗi node có heartbeat và thông số riêng |
| E03 | Đọc DHT thật và publish; đối chiếu Serial, MQTT, web, lịch sử DB | Temperature/humidity đúng node, đúng đơn vị °C/%RH; dữ liệu tăng theo thời gian |
| E04 | Che/chiếu sáng LDR thật | lightPercent giảm/tăng theo quy ước sáng hơn = số lớn hơn; web và lịch sử cập nhật; không gọi % là lux |
| E05 | Climate Auto: cấu hình fanOn=30, fanOff=28; thay đổi nhiệt độ qua hai ngưỡng | ≥30°C bật quạt, ≤28°C tắt; 28–30°C giữ trạng thái. Quan sát quạt thật cùng state báo về |
| E06 | Lighting Auto: lightOn=30, lightOff=45; thay đổi ánh sáng | ≤30% bật LED, ≥45% tắt; khoảng giữa giữ trạng thái, tránh chớp liên tục |
| E07 | Operator đổi ngưỡng trong app | Server gửi config; firmware lưu/áp dụng rồi ACK cùng commandId; UI/DB chỉ báo áp dụng sau ACK |
| E08 | Chuyển Auto → Manual → bật/tắt quạt, còi, đèn | Chờ ACK chuyển mode trước; đúng đầu ra thật thay đổi. Ngưỡng Auto không lập tức ghi đè thao tác Manual |
| E09 | Chuyển Manual → Auto | Firmware đánh giá lại số đo hiện tại theo ngưỡng đã lưu, báo lại trạng thái |
| E10 | Nhiệt độ thật đạt temperatureAlert; sau đó xác nhận cảnh báo trên app | Cảnh báo có lịch sử; xác nhận chỉ đánh dấu đã đọc, không đồng nghĩa hết bất thường hay tự tắt còi. Nhiệt độ xuống ngưỡng làm kết thúc bất thường; chính sách còi theo firmware/mode |
| E11 | Đổi tên phòng, chuyển node sang phòng khác trong cùng nhà, xem lịch sử/CSV | Node giữ ID và dữ liệu cũ; tên/vị trí mới đúng; không chuyển sang phòng thuộc nhà khác |
| E12 | Operator mời viewer, viewer đăng nhập đúng email và nhận lời mời | Viewer thấy đúng nhà; không có quyền config, gửi lệnh, sửa phòng hoặc mời người khác |

## 3. Mất kết nối, lỗi dữ liệu và lệnh

| ID | Thực hiện | Kết quả cần thấy |
| --- | --- | --- |
| R01 | Mất nguồn/Wi-Fi một ESP32 trong khi broker/BE còn chạy | LWT hoặc quá khoảng 35 giây tính từ last_seen cuối chuyển offline; UI có thêm độ trễ refresh. Chỉ node đó mất kết nối; không sinh cảnh báo trùng liên tục |
| R02 | Cấp lại nguồn/Wi-Fi | Firmware tự reconnect và subscribe lại; heartbeat/số đo mới xuất hiện; cảnh báo offline kết thúc; lệnh cũ không tự chạy lại |
| R03 | Ngừng telemetry nhưng vẫn gửi heartbeat mỗi 10 giây trong hơn 60 giây | Node còn online nhưng số đo stale/missing; không tính vào trung bình hiện tại; có cảnh báo stale trong chu kỳ giám sát kế tiếp |
| R04 | Rút/làm lỗi cảm biến theo cách phù hợp mạch; sau đó phục hồi | Firmware không gửi số đo giả/NaN; gửi fault. Heartbeat/telemetry bình thường không tự xóa lỗi; chỉ gửi fault:null khi xác nhận đã phục hồi |
| R05 | Tắt Internet điện thoại, thao tác và bật lại mạng | Banner mất mạng, thao tác bị khóa; giữ thời điểm đồng bộ cuối; kết nối lại tải dữ liệu mới, không xếp hàng/gửi lại lệnh thủ công |
| R06 | Dừng backend, để board vẫn có nguồn/Wi-Fi và broker chạy | Auto tại ESP32 vẫn hoạt động với cấu hình đã lưu. App báo mất server; không báo lệnh thành công giả. Khởi động lại BE thì nhận lại dữ liệu |
| R07 | Dừng broker rồi mở lại | App phân biệt broker mất kết nối với từng node offline; không gửi được lệnh mới. ESP32 và BE reconnect; ESP32 đăng ký lại topic |
| R08 | Reset ESP32 sau khi đổi ngưỡng/mode | bootId đổi, seq bắt đầu lại, config/mode cần giữ trong NVS. Output khởi động tuân theo chính sách nhóm đã chốt; báo lại trạng thái sau reconnect |
| R09 | Gửi lại nguyên gói telemetry có cùng deviceId/bootId/seq | Chỉ một bản ghi DB; không nhân đôi điểm biểu đồ |
| R10 | Gửi gói đo cũ hơn latest nhưng còn trong 7 ngày | Lưu lịch sử theo timestamp gốc; không đè output state mới, không tạo cảnh báo nhiệt độ hiện tại từ số đo cũ |
| R11 | Gửi temperature=999, humidity=101, thiếu trường bắt buộc, tên key sai, timestamp sai hoặc deviceId lệch topic | Bị từ chối; không thêm sensor record hợp lệ. MQTT audit có bản tin bị reject, không lưu raw secret |
| R12 | Firmware chủ động trả ACK failed cho config/lệnh thử | Lệnh failed; không báo config mới đã áp dụng. Ghi được nguyên nhân phù hợp |
| R13 | Tắt chức năng ACK trong firmware lab hoặc trì hoãn hơn 15 giây | Lệnh timeout. ACK mới quá hạn không áp dụng vào DB; UI không tự suy ra trạng thái vật lý. Firmware phải bỏ command hết expiresAt |
| R14 | Gửi lặp cùng commandId vào firmware lab | Thực hiện một lần, trả lại kết quả ACK đã biết; không tạo tác động lặp. Gửi lệnh đặt true/false, không gửi toggle |
| R15 | Hai tab/operator gửi hai lệnh cùng lúc | Tối đa một pending/node; yêu cầu sau bị chặn/409. Sau ACK hoặc timeout mới gửi tiếp |
| R16 | Đứt WebSocket nhưng HTTP còn | App fallback polling mỗi 10 giây khi hiển thị và tự reconnect socket; không bắt người dùng đăng nhập lại chỉ vì đứt socket |
| R17 | Mất MongoDB tạm thời trong môi trường thử riêng | Không báo lưu thành công giả; app báo lỗi/mất server khi không truy xuất được. Sau DB trở lại đối chiếu command/ACK; không sửa URI, xóa DB hay khóa Atlas dùng chung để thử |
| R18 | BE subscribe lại khi broker còn retained status online cũ và board đã tắt | Kiểm tra không nhầm trạng thái cũ là bằng chứng board còn sống. **Điểm cần kiểm chứng/sửa thêm:** status contract hiện chưa có timestamp/bootId và adapter chưa phân biệt bản retained với heartbeat mới; không mặc định ca này PASS |

Để inject gói MQTT, dùng firmware chế độ lab hoặc MQTT client thử thay cho board đang tắt. Tài khoản node bị ràng buộc clientId; mở MQTT client thứ hai cùng clientId sẽ gây ngắt kết nối board, làm sai kết quả test. Số đo tự nhập chỉ là test giao thức, không thay thế dữ liệu cảm biến thật ở E03/E04.

## 4. Phân quyền, MQTT ACL và vòng đời

| ID | Thực hiện | Kết quả cần thấy |
| --- | --- | --- |
| S01 | Operator B gọi API bằng ID node/nhà của A dù biết chính xác ID | Bị 403; không xem được telemetry/alerts/commands hoặc sửa phòng của A. Kiểm tra API, không chỉ nhìn nút trên web |
| S02 | Viewer tự gọi API config/command/sửa phòng/invite | Bị 403; phần cứng không thay đổi |
| S03 | Operator A thu hồi viewer đang mở app | Lần gọi API tiếp theo mất quyền xem nhà; không dùng viewer_ids cũ để vào lại |
| S04 | Nhận node bằng mã sai/hết hạn/đã dùng hoặc node đã thuộc nhà khác | Không đổi chủ/home_id; mã đúng chỉ nhận một lần |
| S05 | Dùng invite sai email/hết hạn/đã dùng/đã hủy | Không vào nhà; không tự được cấp operator/admin |
| S06 | Node climate publish vào topic telemetry của node light | Broker từ chối theo ACL; web/DB node light không bị thay đổi. Chỉ BE reject payload chưa đủ chứng minh ACL |
| S07 | Node subscribe topic của node khác hoặc topic $CONTROL | Broker không cấp quyền/không giao dữ liệu; node không xem/gửi lệnh sang node khác |
| S08 | Admin chuyển node active → locked khi node đang kết nối | Broker ngắt client và từ chối CONNECT lại bằng credential đó; BE từ chối dữ liệu, hủy pending; lịch sử vẫn còn |
| S09 | locked → active, sau đó active → maintenance; cuối buổi decommission node thử | Mở khóa cho reconnect; maintenance chặn hoạt động; decommission không kích hoạt lại được. Mỗi bước có audit/lifecycle event |
| S10 | Khóa tài khoản đang đăng nhập hoặc dùng token CSRF sai | API bảo vệ đúng; user bị khóa mất phiên, CSRF sai không thay đổi dữ liệu |

Trong QoS 0, publish() trả thành công có thể chỉ nghĩa là client gửi được bytes. Với ca ACL phải quan sát broker log, subscriber hợp lệ và DB, không chỉ nhìn return value của firmware.

## 5. Đo lường và minh chứng

Đặt tiêu chí trước khi đo, ghi kết quả thực tế; không gọi các con số dưới đây là kết quả đã đạt:

| Phép đo | Cách đo | Mục tiêu gợi ý để nhóm tự thống nhất |
| --- | --- | --- |
| Publish → web | Từ lúc ESP32 publish đến khi đúng số đo xuất hiện trên web; 20 lần | Ví dụ ≤5 giây trong LAN; không tính thời gian chờ chu kỳ đọc trước publish |
| Gửi lệnh → ACK → output | Serial commandId + thời điểm thao tác web + video đầu ra; 20 lần | Ví dụ ≤5 giây trong LAN, luôn trước timeout 15 giây |
| Offline detection | Ghi last_seen cuối, lúc app hiện offline và thời điểm cắt mạng | So với offlineSeconds=35 và độ trễ cập nhật; LWT có thể báo sớm hơn |
| Reconnect | Cắt/khôi phục Wi-Fi 5 lần; ghi thời gian có heartbeat và telemetry mới | Không nạp lại firmware/restart thủ công BE; tự đưa ra ngưỡng thời gian phù hợp Wi-Fi/NTP |
| Chạy liên tục | Hai node gửi đều ít nhất 30 phút, nếu đủ thời gian kéo dài vài giờ | Ghi số gói/boot/seq, mất gói, reset, lệnh timeout, bộ nhớ/CPU nếu đo được |

Với một đợt boot ổn định và gửi khoảng 4 giây/gói, 30 phút tương ứng khoảng 450 gói/node; dùng lịch publish và seq thực tế để tính, không lấy con số ước lượng làm số gói đã nhận. Báo min/median/p95/max cho các phép đo đủ mẫu; không chọn riêng lần đẹp nhất.

Video demo tối thiểu: ID board climate đang demo → số đo thật đổi → MQTT nhận → web/lịch sử đổi → đổi config/Manual → đầu ra thật đổi + ACK → mất mạng/reconnect → hành động viewer bị từ chối → khóa node thật tại broker. Nếu có board thứ hai thì bổ sung minh chứng tương ứng. Che mật khẩu, mã claim và secret trong màn hình ghi hình.

## 6. Test phần mềm đang có

```powershell
npm.cmd test
npm.cmd run test:ui
npm.cmd run test:home-ui
npm.cmd run test:ai-ui
npm.cmd run ai:demo
```

Các lệnh dùng mongod tạm/simulator, không ghi vào Atlas cá nhân. Sau khi sắp xếp thư mục ngày 13/11/2026 đã chạy lại: 40 test backend/AI PASS, ba bộ browser QA PASS và build frontend PASS. Xem [VALIDATION](VALIDATION.md). Kết quả này không biến các ca ESP32/MQTT/TLS thật thành PASS. Ca Docker D01–D06 ở [deployment/README](../deployment/README.md) vẫn chưa chạy.

Hướng dẫn nối phần cứng: [HARDWARE-INTEGRATION.md](HARDWARE-INTEGRATION.md). Hợp đồng JSON: [MQTT-CONTRACT.md](MQTT-CONTRACT.md).

## 7. Bổ sung AI cảm biến và giờ đăng nhập

Các ca sau bổ sung cho 40 ca lõi. Fixture/synthetic phải ghi riêng với ESP32/người dùng thật. Hướng dẫn chi tiết [AI-GUIDE.md](AI-GUIDE.md).

| ID | Thực hiện | Kết quả cần thấy |
| --- | --- | --- |
| A01 | Huấn luyện khi chưa đủ dữ liệu đều hoặc chỉ có dữ liệu unknown/demo nhưng không cho phép demo | Báo thiếu dữ liệu; không tự tạo model hardware giả |
| A02 | Train trên dữ liệu bình thường được chọn | Worker chạy nền, giữ split theo thời gian/scaler train-only; model/report lưu DB, UI có loss/MAE/RMSE/baseline |
| A03 | Tạo hai bucket biến thiên bất thường liên tiếp trong môi trường lab | Score vượt threshold, có một cảnh báo AI; không tự gửi lệnh/quạt hoặc khẳng định cảm biến hỏng |
| A04 | Mất dữ liệu hoặc gói gửi bù cũ, sau đó đủ dữ liệu liên tục trở lại | Warmup/stale rõ ràng; không đánh giá dữ liệu cũ như hiện tại; model dùng tiếp sau khi đủ cửa sổ |
| A05 | Viewer/nhà khác gọi train hoặc xem model node không được cấp quyền | 403; weights không trả frontend |
| A06 | Train lại lỗi hoặc AI phân tích lỗi | Giữ model ready cũ; lỗi AI không chặn đăng nhập đúng mật khẩu, không biến thành đánh giá normal |
| A07 | Tài khoản mới hoặc login nhiều lần một ngày | Chưa đủ 20 mẫu/5 ngày thì insufficient_data; login lặp một giờ không đủ giả lập nhiều ngày |
| A08 | Lịch sử giờ ban ngày so với login giờ hiếm; tài khoản khác thường làm đêm | Mô hình cá nhân cảnh báo giờ hiếm; không mặc định mọi login ban đêm bất thường; kiểm tra qua nửa đêm |
| A09 | Xác nhận expected/unrecognized; thử admin xác nhận thay user khác | Chỉ chính chủ được xác nhận; anomaly chưa xác nhận/unrecognized không tự trở thành baseline; không khóa user tự động |
| A10 | Viewer gọi lịch sử user khác hoặc mở app offline; xem cache PWA | Không lộ lịch sử, API AI không cache; lịch sử/cảnh báo riêng tài khoản, dữ liệu AI cảm biến theo nhà |
