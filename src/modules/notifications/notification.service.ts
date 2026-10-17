import type { Prisma } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { AuthContext } from '../auth/index.js';

export async function listNotifications(auth: AuthContext, query: { page: number; pageSize: number; unreadOnly: boolean }) {
  const where: Prisma.NotificationWhereInput = { userId: auth.userId, dismissedAt: null, ...(query.unreadOnly ? { readAt: null } : {}) };
  const prisma = getPrisma();
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: auth.userId, readAt: null, dismissedAt: null } }),
  ]);
  return { items, total, unread };
}
export async function markRead(auth: AuthContext, notificationId: string) { const result = await getPrisma().notification.updateMany({ where: { id: notificationId, userId: auth.userId }, data: { readAt: new Date() } }); if (!result.count) throw new NotFoundError(ErrorCode.NOTIFICATION_NOT_FOUND, 'That notification was not found.'); return getPrisma().notification.findUniqueOrThrow({ where: { id: notificationId } }); }
export async function markAllRead(auth: AuthContext) { return getPrisma().notification.updateMany({ where: { userId: auth.userId, readAt: null }, data: { readAt: new Date() } }); }
export async function dismiss(auth: AuthContext, notificationId: string): Promise<void> { const result = await getPrisma().notification.updateMany({ where: { id: notificationId, userId: auth.userId }, data: { dismissedAt: new Date() } }); if (!result.count) throw new NotFoundError(ErrorCode.NOTIFICATION_NOT_FOUND, 'That notification was not found.'); }
export async function listPreferences(auth: AuthContext) { return getPrisma().notificationPreference.findMany({ where: { userId: auth.userId }, orderBy: { eventKey: 'asc' } }); }
export async function setPreference(auth: AuthContext, eventKey: string, enabled: boolean) { return getPrisma().notificationPreference.upsert({ where: { userId_eventKey: { userId: auth.userId, eventKey } }, create: { userId: auth.userId, eventKey, enabled }, update: { enabled } }); }
