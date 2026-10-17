import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './notification.controller.js';
export function createNotificationRouter(): Router { const router = Router(); router.use(authenticate()); router.get('/', asyncHandler(controller.list)); router.post('/read-all', asyncHandler(controller.readAll)); router.get('/preferences', asyncHandler(controller.preferences)); router.put('/preferences', asyncHandler(controller.setPreference)); router.post('/:notificationId/read', asyncHandler(controller.read)); router.delete('/:notificationId', asyncHandler(controller.dismiss)); return router; }
