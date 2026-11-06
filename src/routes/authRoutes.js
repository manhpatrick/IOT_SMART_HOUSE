import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { login, getMe, logout, changePassword } from '../controller/auth.controller.js';
import { authMiddleware, csrfMiddleware, sameOrigin } from '../middleware/authMiddleware.js';

const route = express.Router();
route.post('/login', sameOrigin, rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Thử đăng nhập quá nhiều lần. Vui lòng đợi 15 phút.' } }), login);
route.use(authMiddleware, csrfMiddleware);
route.get('/me', getMe);
route.post('/logout', logout);
route.patch('/password', changePassword);
export default route;
