import { z } from 'zod';

export default function errorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map(i => `${i.path.join('.') || 'Dữ liệu'}: ${i.message}`).join('; ') });
  if (error.code === 11000) return res.status(409).json({ error: 'Email, mã thiết bị hoặc dữ liệu duy nhất đã tồn tại.' });
  if (['ValidationError', 'CastError'].includes(error.name)) return res.status(400).json({ error: 'Dữ liệu không đúng định dạng của model MongoDB.' });
  const status = error.status || 500;
  if (status >= 500) console.error('Request failed:', error.name || 'Error', error.code || status);
  res.status(status).json({ error: status >= 500 && !error.status ? 'Có lỗi hệ thống hoặc mất kết nối database. Vui lòng thử lại.' : error.message });
}
