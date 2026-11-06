import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { User } from '../models/index.js';
import * as models from '../models/index.js';
import { getConfig } from '../config/env.js';
import { connectDB, disconnectDB } from './database/mongodb.js';
import { seedDatabase } from './database/seed-data.js';
import { createIoT } from './services/iot.service.js';
import { isSessionValid } from './services/session.service.js';
import { authMiddleware, csrfMiddleware } from './middleware/authMiddleware.js';
import errorMiddleware from './middleware/errorMiddleware.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import telemetryRoutes from './routes/telemetryRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function createApplication(overrides = {}) {
  const config = getConfig(overrides);
  if (!config.demo && (!config.sessionSecret || config.sessionSecret.length < 32)) throw new Error('SESSION_SECRET phải có ít nhất 32 ký tự ngoài chế độ demo.');
  await connectDB(config);
  try { await seedDatabase(config); }
  catch (error) { await disconnectDB(); throw error; }

  const app = express(), server = createServer(app), sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  let closed = false;
  const broadcasts = new Set();
  const notify = type => {
    if (closed) return;
    const work = Promise.all([...sockets.clients].map(async client => {
      if (client.readyState !== 1) return;
      const [valid, user] = await Promise.all([isSessionValid(client.sessionId), User.findById(client.userId).select('status').lean()]);
      if (!valid || user?.status !== 'active') { client.close(1008, 'Session ended'); return; }
      if (client.readyState === 1) client.send(JSON.stringify({ type, timestamp: new Date().toISOString() }));
    })).catch(() => {}).finally(() => broadcasts.delete(work));
    broadcasts.add(work);
  };
  const sessionStore = MongoStore.create({ client: mongoose.connection.getClient(), dbName: config.dbName, collectionName: 'sessions', stringify: false, autoRemove: 'disabled', ttl: 8 * 3600 });
  sessionStore.on('error', () => console.warn('MongoDB session store đang mất kết nối.'));
  const iot = createIoT({ demo: config.demo, notify, mqttOptions: config.mqtt });
  Object.assign(app.locals, { config, iot, notify });

  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], fontSrc: ["'self'"], upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null } }, strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false }));
  app.use(express.json({ limit: '24kb' }));
  const sessionMiddleware = session({ name: 'nodo.sid', secret: config.sessionSecret || randomBytes(32).toString('hex'), resave: false, saveUninitialized: false,
    store: sessionStore, cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600_000 } });
  app.use(sessionMiddleware);
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/api/health', (req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({ ok: connected, database: 'mongodb' });
  });
  app.get('/api/public-config', (req, res) => res.json({ demo: config.demo, name: 'NODO Admin' }));

  app.use('/api/auth', authRoutes);
  app.use('/api', authMiddleware, csrfMiddleware);
  app.use('/api/users', userRoutes);
  app.use('/api/devices', deviceRoutes);
  app.use('/api/telemetry', telemetryRoutes);
  app.use('/api', dashboardRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'API không tồn tại.' }));

  app.use('/assets', express.static(root + 'public/assets', { maxAge: '1h' }));
  app.get('/assets/chart.umd.js', (req, res) => res.sendFile(root + 'node_modules/chart.js/dist/chart.umd.js'));
  app.use(express.static(root + 'public', { index: 'index.html' }));
  app.get('/login', (req, res) => res.sendFile(root + 'public/login.html'));
  app.get('/docs/:name', (req, res) => {
    const allowed = ['ADMIN-CHECKLIST.md', 'MQTT-CONTRACT.md', 'API.md', 'MONGODB-ATLAS.md'];
    if (!allowed.includes(req.params.name)) return res.sendStatus(404);
    res.type('text/plain; charset=utf-8').sendFile(root + 'docs/' + req.params.name);
  });
  app.use(errorMiddleware);

  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws' || !req.headers.origin || ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)) return socket.destroy();
    sessionMiddleware(req, { getHeader() {}, setHeader() {}, end() {} }, () => {
      Promise.resolve().then(async () => {
        const user = req.session?.userId && await User.findById(req.session.userId).select('status').lean();
        if (!user || user.status !== 'active') return socket.destroy();
        sockets.handleUpgrade(req, socket, head, client => {
          client.userId = user._id; client.sessionId = req.sessionID;
          client.send(JSON.stringify({ type: 'connected' }));
        });
      }).catch(() => socket.destroy());
    });
  });

  return { app, server, iot, models, connection: mongoose.connection,
    async close() {
      if (closed) return;
      closed = true;
      for (const client of sockets.clients) client.terminate();
      sockets.close();
      await iot.close();
      await new Promise(resolve => server.listening ? server.close(resolve) : resolve());
      await Promise.allSettled([...broadcasts]);
      await disconnectDB();
    },
  };
}
