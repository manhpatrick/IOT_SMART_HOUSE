# Kiểm thử

Chạy tại gốc repository:

```powershell
npm.cmd test
npm.cmd run test:ui
npm.cmd run test:home-ui
npm.cmd run test:ai-ui
npm.cmd run ai:demo
```

Test API/AI/migration dùng MongoDB tạm riêng, không dùng `.env` Atlas. Các bộ browser dùng Playwright; nếu máy mới chưa có Chromium, chạy `npx playwright install chromium` trước. Lần đầu mongodb-memory-server có thể tải binary mongod nên cần mạng.

Kịch bản thực nghiệm phần cứng/AI: [TEST-PLAN](../docs/TEST-PLAN.md). Kết quả đã chạy: [VALIDATION](../docs/VALIDATION.md). Docker: [D01–D06](../deployment/README.md). Report AI synthetic: [experiments](../docs/experiments/ai-synthetic-report.json). Test phần mềm/simulator không thay thế video và số đo từ ESP32 thật.
