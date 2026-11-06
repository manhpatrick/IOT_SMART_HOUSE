import express from 'express';
import { getOverview, getCommands, getAlerts, acknowledgeAlert, getAudit, getSettings, updateSettings } from '../controller/dashboard.controller.js';
import { demoConnection } from '../controller/device.controller.js';
import { adminMiddleware, operatorMiddleware } from '../middleware/adminMiddleware.js';

const route = express.Router();
route.get('/overview', getOverview);
route.get('/commands', getCommands);
route.get('/alerts', getAlerts);
route.patch('/alerts/:id/acknowledge', operatorMiddleware, acknowledgeAlert);
route.get('/audit', adminMiddleware, getAudit);
route.get('/settings', getSettings);
route.patch('/settings', adminMiddleware, updateSettings);
route.post('/demo/devices/:id/connection', adminMiddleware, demoConnection);
export default route;
