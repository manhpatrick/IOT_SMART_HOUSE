import { createApplication } from './app.js';

let application;
try {
  application = await createApplication();
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3080);
  application.server.on('error', async error => {
    console.error(error.code === 'EADDRINUSE' ? `Cổng ${port} đang được sử dụng. Dừng phiên server cũ rồi chạy lại.` : 'Không khởi động được HTTP server.');
    await application.close(); process.exitCode = 1;
  });
  application.server.listen(port, host, () => {
    console.log(`MongoDB connected: ${application.connection.name}`);
    console.log(`NODO Admin: http://${host}:${port}`);
    console.log(process.env.DEMO_MODE !== 'false' ? 'Demo nodes enabled; users, telemetry and sessions are stored in MongoDB.' : 'Hardware mode: simulated nodes disabled.');
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (application) await application.close();
  process.exit(0);
});
