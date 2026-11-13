# MongoDB và mô hình dữ liệu

Đây là mã schema/kết nối/khởi tạo, **không phải bản dump dữ liệu cá nhân**. Mặc định chạy npm dùng URI trong `.env`; Compose local dùng MongoDB riêng trong volume `mongo_data`, không dùng Atlas cá nhân.

| Nhóm model | Vai trò |
| --- | --- |
| User, Home, HomeMember, Room, Invitation | Tài khoản, chủ nhà/thành viên, phòng, lời mời |
| Device, DeviceEvent | Profile, lifecycle, nhà/phòng, trạng thái và sự kiện node |
| Telemetry | Số đo, timestamp, bootId/seq, nguồn demo/hardware/unknown |
| Command | Lệnh/config, ACK, trạng thái pending/applied/failed/timeout/cancelled |
| Alert, AuditLog, Setting | Cảnh báo IoT/AI cảm biến, nhật ký, cấu hình |
| AiModel, AiResult | Model/weights, báo cáo train/test, score và kết quả suy luận |
| LoginEvent, AccountAlert | Dữ liệu giờ đăng nhập và cảnh báo riêng tài khoản |
| sessions (connect-mongo) | Phiên đăng nhập có TTL |

`models/*.model.js` là nguồn chính xác cho field/index. `mongodb.js` kết nối và tạo collection/index; `seed-data.js` khởi tạo khi DB mới. DEMO_MODE=false không tự xóa dữ liệu demo đã tồn tại.

Lệnh chạy tại gốc repo:

```powershell
npm.cmd run db:check
npm.cmd run seed
npm.cmd run migrate:sqlite -- C:\path\nodo.sqlite
```

Migration đọc SQLite cũ, giữ ID/hash và chỉ bổ sung bản ghi chưa có. Không dùng dữ liệu thật làm fixture. Các test dùng MongoDB tạm riêng, không cần đổi `.env`. Xem [Atlas](../docs/MONGODB-ATLAS.md) và phần migration trong README gốc. Backup/restore thực tế và thử phục hồi chưa có bằng chứng trong repo.
