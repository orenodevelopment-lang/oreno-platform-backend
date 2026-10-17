import type { Request, Response } from 'express';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { sendNoContent, sendSuccess } from '../../common/http/response.js';
import { validate } from '../../common/validation/validate.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './notification.service.js';
import { notificationParamsSchema, notificationQuerySchema, preferenceSchema } from './notification.schema.js';
export async function list(req: Request, res: Response): Promise<void> { const { query } = validate(req, { query: notificationQuerySchema }); const result = await service.listNotifications(requireAuthContext(req), query); sendSuccess(res, { notifications: result.items, unreadCount: result.unread }, { meta: { ...buildPageMeta(query, result.total) } }); }
export async function read(req: Request, res: Response): Promise<void> { const { params } = validate(req, { params: notificationParamsSchema }); sendSuccess(res, { notification: await service.markRead(requireAuthContext(req), params.notificationId) }); }
export async function readAll(req: Request, res: Response): Promise<void> { const result = await service.markAllRead(requireAuthContext(req)); sendSuccess(res, { updated: result.count }); }
export async function dismiss(req: Request, res: Response): Promise<void> { const { params } = validate(req, { params: notificationParamsSchema }); await service.dismiss(requireAuthContext(req), params.notificationId); sendNoContent(res); }
export async function preferences(req: Request, res: Response): Promise<void> { sendSuccess(res, { preferences: await service.listPreferences(requireAuthContext(req)) }); }
export async function setPreference(req: Request, res: Response): Promise<void> { const { body } = validate(req, { body: preferenceSchema }); sendSuccess(res, { preference: await service.setPreference(requireAuthContext(req), body.eventKey, body.enabled) }); }
