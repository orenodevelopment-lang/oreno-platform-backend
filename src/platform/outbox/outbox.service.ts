import type { Prisma, PrismaClient } from '@prisma/client';
import type { EventKey } from '../events/event-catalog.js';

/**
 * Transactional outbox.
 *
 * `emitEvent` must be called with the transaction client that performed the
 * business change. Writing the event in a separate connection would reintroduce
 * exactly the dual-write problem the outbox exists to solve: a committed offer
 * with no "send the offer email" event, or an event for an offer that rolled
 * back.
 */
export type OutboxClient = Pick<Prisma.TransactionClient, 'outboxEvent'>;

export interface EmitEventInput<T> {
  eventKey: EventKey;
  aggregateType: string;
  aggregateId: string;
  organisationId?: string | null;
  payload: T;
  /** Delay publication; used for reminders scheduled in the future. */
  availableAt?: Date;
}

export async function emitEvent<T>(
  client: OutboxClient | PrismaClient,
  input: EmitEventInput<T>,
): Promise<void> {
  await client.outboxEvent.create({
    data: {
      eventKey: input.eventKey,
      aggregateType: input.aggregateType.slice(0, 80),
      aggregateId: input.aggregateId,
      organisationId: input.organisationId ?? null,
      payload: input.payload as Prisma.InputJsonValue,
      ...(input.availableAt ? { availableAt: input.availableAt } : {}),
    },
  });
}

/** Emit several events in one call, still inside the caller's transaction. */
export async function emitEvents(
  client: OutboxClient | PrismaClient,
  inputs: readonly EmitEventInput<unknown>[],
): Promise<void> {
  if (inputs.length === 0) return;
  await client.outboxEvent.createMany({
    data: inputs.map((input) => ({
      eventKey: input.eventKey,
      aggregateType: input.aggregateType.slice(0, 80),
      aggregateId: input.aggregateId,
      organisationId: input.organisationId ?? null,
      payload: input.payload as Prisma.InputJsonValue,
      ...(input.availableAt ? { availableAt: input.availableAt } : {}),
    })),
  });
}
