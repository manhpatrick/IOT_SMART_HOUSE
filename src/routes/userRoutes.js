import express from 'express';
import { getUsers, createUser, updateUser } from '../controller/user.controller.js';
import { adminMiddleware } from '../middleware/adminMiddleware.js';

const route = express.Router();
route.use(adminMiddleware);
route.get('/', getUsers);
route.post('/', createUser);
route.patch('/:id', updateUser);
export default route;
