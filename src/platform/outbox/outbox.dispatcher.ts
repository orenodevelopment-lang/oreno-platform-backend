import type { Prisma } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';
import { createModuleLogger } from '../../common/logging/logger.js';
import { increment, MetricName } from '../../common/observability/metrics.js';
import {
  enqueue,
  isQueueingEnabled,
  JOB_NAMES,
  QUEUE_NAMES,
  stableJobId,
} from '../queue/queue.registry.js';
import { isKnownEventKey } from '../events/event-catalog.js';

const log = createModuleLogger('outbox');

/**
 * Outbox dispatcher.
 *
 * Claims a batch of due events with `FOR UPDATE SKIP LOCKED` so several worker
 * instances can drain the table concurrently without duplicating work, enqueues
 * each one to the domain-events queue, and marks it published.
 *
 * Publication is at-least-once: a crash between `enqueue` and the status update
 * re-publishes the event, which is why handlers must be idempotent. That is a
 * cheaper property to maintain than exactly-once delivery.
 */
const MAX_ATTEMPTS = 10;
const BACKOFF_BASE_MS = 5_000;
const STALE_CLAIM_MINUTES = 2;

interface ClaimedRow {
  id: string;
  organisation_id: string | null;
  event_key: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Prisma.JsonValue;
  attempts: number;
  created_at: Date;
}

export interface DispatchSummary {
  claimed: number;
  published: number;
  deferred: number;
  failed: number;
}

export async function dispatchPendingEvents(batchSize = 50): Promise<DispatchSummary> {
  const summary: DispatchSummary = { claimed: 0, published: 0, deferred: 0, failed: 0 };

  if (!isQueueingEnabled()) {
    // Without Key Value there is nowhere to publish. Leaving events PENDING
    // means they are delivered once the queue backend returns.
    return summary;
  }

  const prisma = getPrisma();
  const claimed = await prisma.$queryRaw<ClaimedRow[]>`
    UPDATE outbox_events
       SET status = 'PUBLISHING',
           claimed_at = now(),
           attempts = attempts + 1
     WHERE id IN (
       SELECT id
         FROM outbox_events
        WHERE (
          (status = 'PENDING' AND available_at <= now())
          OR
          (status = 'PUBLISHING' AND claimed_at <= now() - (${STALE_CLAIM_MINUTES} * INTERVAL '1 minute'))
        )
        ORDER BY available_at ASC, created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id, organisation_id, event_key, aggregate_type, aggregate_id,
              payload, attempts, created_at
  `;

  summary.claimed = claimed.length;
  if (claimed.length === 0) return summary;

  for (const row of claimed) {
    try {
      if (!isKnownEventKey(row.event_key)) {
        throw new Error(`Unknown domain event key: ${row.event_key}`);
      }
      await enqueue(
        QUEUE_NAMES.DOMAIN_EVENTS,
        JOB_NAMES.DISPATCH_DOMAIN_EVENT,
        {
          eventId: row.id,
          eventKey: row.event_key,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          ...(row.organisation_id ? { organisationId: row.organisation_id } : {}),
          payload: row.payload,
          occurredAt: row.created_at.toISOString(),
          attempts: row.attempts,
        },
        // The outbox row id is the natural job id, so a re-publish after a
        // crash collapses onto the same BullMQ job instead of duplicating it.
        { jobId: stableJobId('outbox', row.id) },
      );

      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          claimedAt: null,
          lastError: null,
        },
      });
      summary.published += 1;
      increment(MetricName.OUTBOX_PUBLISHED, { event: row.event_key });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exhausted = row.attempts >= MAX_ATTEMPTS;

      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: exhausted
          ? {
              status: 'FAILED',
              claimedAt: null,
              failedAt: new Date(),
              lastError: message.slice(0, 1000),
            }
          : {
              status: 'PENDING',
              claimedAt: null,
              // Exponential backoff, capped at ten minutes.
              availableAt: new Date(
                Date.now() + Math.min(BACKOFF_BASE_MS * 2 ** row.attempts, 600_000),
              ),
              lastError: message.slice(0, 1000),
            },
      });

      if (exhausted) {
        summary.failed += 1;
        increment(MetricName.OUTBOX_FAILED, { event: row.event_key });
        log.error(
          { err: error, eventId: row.id, eventKey: row.event_key, attempts: row.attempts },
          'outbox event exhausted retries',
        );
      } else {
        summary.deferred += 1;
        log.warn(
          { err: error, eventId: row.id, eventKey: row.event_key, attempts: row.attempts },
          'outbox publication deferred',
        );
      }
    }
  }

  return summary;
}

/** Requeue a FAILED or DISCARDED event by hand (platform-admin action). */
export async function requeueOutboxEvent(eventId: string): Promise<boolean> {
  const result = await getPrisma().outboxEvent.updateMany({
    where: { id: eventId, status: { in: ['FAILED', 'DISCARDED'] } },
    data: {
      status: 'PENDING',
      attempts: 0,
      availableAt: new Date(),
      claimedAt: null,
      failedAt: null,
      lastError: null,
    },
  });
  return result.count > 0;
}

/** Housekeeping: drop successfully published rows once they are a week old. */
export async function prunePublishedOutbox(olderThanDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await getPrisma().outboxEvent.deleteMany({
    where: { status: 'PUBLISHED', publishedAt: { lt: cutoff } },
  });
  return result.count;
}
