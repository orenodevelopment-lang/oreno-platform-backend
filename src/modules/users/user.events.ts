import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import type { EmitEventInput } from '../../platform/outbox/outbox.service.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import type { Prisma } from '@prisma/client';

/**
 * Domain events emitted by the users module.
 *
 * A profile change is an in-place update with no durable follow-up work, so it
 * is recorded as an audit entry only. This module therefore emits no outbox
 * events today; the helper exists so a future durable reaction (a directory
 * re-index, a welcome sequence) is added in one place rather than scattered
 * across the service.
 */
export const USER_EVENTS = {
  STATUS_CHANGED: EVENT_KEYS.USER_STATUS_CHANGED,
} as const;

/**
 * Emit a user status change. Status changes are rare, consequential and always
 * need a durable follow-up (session revocation, notification), so they travel
 * through the outbox like every other cross-module signal.
 */
export async function emitUserStatusChanged(
  client: Prisma.TransactionClient,
  payload: { userId: string; from: string; to: string },
): Promise<void> {
  const input: EmitEventInput<typeof payload> = {
    eventKey: EVENT_KEYS.USER_STATUS_CHANGED,
    aggregateType: 'User',
    aggregateId: payload.userId,
    payload,
  };
  await emitEvent(client, input);
}
