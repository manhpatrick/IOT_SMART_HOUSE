# Backend Express

Chạy các lệnh từ **gốc repository**, không phải thư mục này:

```powershell
npm.cmd ci
npm.cmd run dev
```

- `config/env.js`: đọc `.env` thông qua entry script npm.
- `src/server.js`, `src/app.js`: khởi động MongoDB, Express, session, MQTT/AI và WebSocket.
- `src/routes/` → `middleware/` → `controller/` → `services/`: request, phân quyền và nghiệp vụ.
- `src/ai/`: RNN cảm biến, KDE giờ đăng nhập, worker training.
- `scripts/`: thực nghiệm synthetic và in gói MQTT mẫu; gọi bằng npm scripts ở gốc.

Schema DB ở `../database/models/`, frontend ở `../frontend/public/`. Không có package.json hay node_modules riêng cho từng thư mục. API và URL web giữ nguyên sau khi sắp xếp.

Xem [API](../docs/API.md), [AI](../docs/AI-GUIDE.md), [phạm vi quyền theo nhà](../docs/HOMES-AND-MOBILE.md).
