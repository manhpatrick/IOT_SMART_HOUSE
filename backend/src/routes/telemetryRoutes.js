import express from 'express';
import { getTelemetry } from '../controller/telemetry.controller.js';

const route = express.Router();
route.get('/', getTelemetry);
export default route;
