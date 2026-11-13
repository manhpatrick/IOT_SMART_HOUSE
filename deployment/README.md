# Triển khai Docker

## Trạng thái

Đã có Dockerfile multi-stage, runtime user node, healthcheck, Compose local/HTTPS và `.dockerignore` loại secret/dữ liệu local khỏi image. **Docker local đã build và chạy thành công:** app/MongoDB healthy, API health và giao diện hoạt động. MQTT lab đã kết nối Mosquitto Windows cổng 1884 và nhận số đo từ MQTTX. Chưa có thực nghiệm ESP32 thật, bản HTTPS công khai hoặc test down/up bảo toàn toàn bộ dữ liệu/model. Trạng thái chi tiết: [CURRENT-STATUS](../docs/CURRENT-STATUS.md).

Firmware chạy trên ESP32, không chạy trong container server và không cần copy vào image. Hai cấu hình dưới đây đều chạy AI bằng Node worker trong app; không có container Python/GPU. Broker Mosquitto vẫn nằm ngoài Compose.

## 1. Demo local độc lập với Atlas

Lệnh tiện dụng từ gốc repo: `npm.cmd run docker:up` khởi động, chờ container healthy và in URL bấm mở trên terminal. Khi sửa code, dùng `npm.cmd run docker:build` để build lại rồi in URL. Lệnh `docker compose ...` trực tiếp vẫn hoạt động nhưng không có phần in URL bổ sung. Nếu publish trên `0.0.0.0`, script cũng liệt kê IPv4 để thử từ điện thoại cùng mạng; nếu vẫn bind localhost thì chỉ máy tính truy cập được.

Cần Docker Engine/Desktop đang chạy với Linux containers và Docker Compose v2. Tại gốc repo, dừng server dev khác nếu đang dùng port 3080:

```powershell
docker version
docker compose version
docker compose -f deployment/compose.local.yaml config --quiet
docker compose -f deployment/compose.local.yaml up -d --build
docker compose -f deployment/compose.local.yaml ps
Invoke-RestMethod http://127.0.0.1:3080/api/health
docker compose -f deployment/compose.local.yaml logs --tail 100 app
```

Mở `http://127.0.0.1:3080` hoặc `/app`. Tài khoản demo trong README gốc. `compose.local.yaml` định nghĩa toàn bộ cấu hình app và không đọc `.env` Atlas qua env_file. MongoDB không publish port host; app chỉ publish localhost. Đây là demo HTTP local, DEMO_MODE=true, không có cảm biến/broker thật; không dùng cấu hình này để đưa ra Internet. Hai node giả lập là dữ liệu demo phần mềm, không thay thế một/hai board vật lý.

Kiểm tra bảo toàn dữ liệu: tạo một phòng, ghi ID; thực hiện `down` rồi `up -d` và đối chiếu phòng còn tồn tại:

```powershell
docker compose -f deployment/compose.local.yaml down
docker compose -f deployment/compose.local.yaml up -d
```

Không thêm `--volumes`/`-v` khi cần giữ dữ liệu: nó xóa volume DB. Không có tự động backup chỉ vì đã dùng volume.

## 2. Server HTTPS + Atlas + broker bên ngoài

### Lab MQTT trên laptop, giữ MongoDB Docker

Broker lab Windows hiện dùng cổng **1884** để tránh dịch vụ Mosquitto Windows chiếm 1883. Lần đầu copy `.env.mqtt-lab.example` thành `.env.mqtt-lab`, điền mật khẩu của `nodo-backend` vào `MQTT_PASSWORD=`; file local được Git ignore. Chạy `npm run docker:mqtt` để giữ DB/web, tắt simulator, nối broker host và in URL. Khi sửa code, dùng `npm run docker:mqtt:build`. Không ghi đè file mật khẩu local đã có. Nếu mật khẩu chứa ký tự đặc biệt, dùng cú pháp giá trị đặt trong dấu nháy đơn của env_file.

Đăng nhập admin, kiểm tra Cài đặt báo HARDWARE MODE và broker kết nối; đăng ký một ID mới như `hw-climate-01`, provision và kích hoạt. Các node demo cũ vẫn lưu trong DB nhưng không tự có credential broker thật. MQTTX trên laptop dùng `127.0.0.1:1884` và tài khoản riêng của node từ web. Không dùng `nodo-backend` hay `lab-admin` để giả board. `npm run docker:up` chuyển lại cấu hình demo; khi thử MQTT tiếp tục dùng `docker:mqtt`. Sửa `.env.mqtt-lab` rồi chạy lại `docker:mqtt` để nạp mật khẩu mới.

Broker lab được chạy riêng, không nằm trong Docker; cần bảo đảm nó vẫn chạy. Đây là cấu hình test MQTT qua localhost/LAN, chưa có TLS hoặc HTTPS công khai.

`compose.yaml` chạy app và Caddy. Điền `.env` từ mẫu ở gốc: URI/database, secret, bootstrap admin, tên miền `SITE_DOMAIN`; với board thật đặt DEMO_MODE=false và cấu hình MQTT/TLS/Dynamic Security theo [hướng dẫn phần cứng](../docs/HARDWARE-INTEGRATION.md). Dùng database sạch riêng cho demo vật lý nếu trước đó đã seed mô phỏng.

```powershell
docker compose --env-file .env -f deployment/compose.yaml config --quiet
docker compose --env-file .env -f deployment/compose.yaml up -d --build
docker compose --env-file .env -f deployment/compose.yaml ps
```

Tên miền phải trỏ đúng server; Caddy cần cổng 80/443 để cấp và phục vụ HTTPS. App dùng secure session cookie, TRUST_PROXY=1 và không publish 3080 trực tiếp. Mở `https://<domain>/app`, kiểm tra login, WebSocket và API. Dùng `config --quiet` để validate mà không in toàn bộ biến môi trường chứa mật khẩu vào log/screenshot.

MQTT_URL trong container phải trỏ tới broker thực: hostname công khai/TLS hoặc `host.docker.internal:1883` nếu broker ở host trong lab. `localhost` trong container là chính container. ESP32 dùng địa chỉ broker mà board truy cập được, không dùng tên nội bộ `app` hay `mongo` của Compose. Mẫu `mosquitto-lab.conf.example` chưa tự tạo broker/cấp credential.

## 3. Minh chứng để hoàn tất mục Docker

| Ca | Bằng chứng cần lưu | Hiện tại |
| --- | --- | --- |
| D01 | Docker/Compose version, build log, image ID, commit mã nguồn | Build local đã qua; bổ sung ảnh/log vào báo cáo nộp |
| D02 | `compose ps` app/Mongo healthy; health API trả 200 | Đã kiểm tra healthy và HTTP 200 |
| D03 | Đăng nhập, FE/AI panel, WebSocket trong container | Login và trang telemetry đã thử trên container; bổ sung minh chứng đầy đủ các màn/AI |
| D04 | Down/up giữ dữ liệu trong volume; AI model vẫn có sau restart | Chưa chạy |
| D05 | Với HTTPS: domain, chứng chỉ, cookie và truy cập từ điện thoại | Chưa chạy |
| D06 | Với phần cứng: ESP32 → broker → app container → web → command → ACK | Chưa chạy |

D01–D04 chứng minh triển khai phần mềm bằng Docker; D05 cần cho bản HTTPS/điện thoại từ xa; D06 là bằng chứng tích hợp IoT thật. Không bắt buộc container hóa firmware, cũng không bắt buộc container hóa mọi dịch vụ bên ngoài để gọi là triển khai Docker. Dùng broker ngoài vẫn cần cung cấp cấu hình và cách tái hiện.

Tham khảo chính thức: [build context và Dockerfile](https://docs.docker.com/reference/compose-file/build/), [chờ database healthy trước khi tạo app](https://docs.docker.com/compose/how-tos/startup-order/).
