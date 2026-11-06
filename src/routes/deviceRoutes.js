import express from 'express';
import { getDevices, getDevice, createDevice, updateDevice, changeLifecycle, updateConfig, sendCommand } from '../controller/device.controller.js';
import { adminMiddleware, operatorMiddleware } from '../middleware/adminMiddleware.js';

const route = express.Router();
route.get('/', getDevices);
route.post('/', adminMiddleware, createDevice);
route.get('/:id', getDevice);
route.patch('/:id', adminMiddleware, updateDevice);
route.post('/:id/lifecycle', adminMiddleware, changeLifecycle);
route.patch('/:id/config', operatorMiddleware, updateConfig);
route.post('/:id/commands', operatorMiddleware, sendCommand);
export default route;
