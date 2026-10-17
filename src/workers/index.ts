import type { Job } from 'bullmq';
import { createModuleLogger } from '../common/logging/logger.js';
import { pruneExpiredSessions } from '../modules/auth/session.service.js';
import { dispatchDomainEvent } from '../platform/events/event-bus.js';
import { isKnownEventKey } from '../platform/events/event-catalog.js';
import { deliverEmail, type EmailJobPayload } from '../platform/email/email.service.js';
import { registerEmailEventHandlers } from '../platform/email/email.events.js';
import { processFileScan } from '../modules/files/file.service.js';
import { expireExports, processExport } from '../modules/exports/index.js';
import { registerNotificationEventHandlers } from '../modules/notifications/index.js';
import { activateDuePlacements, expireStaleOffers } from './lifecycle.service.js';
import { processReminder, scanDueReminders } from './reminder.service.js';
import {
  sendExpiringInvitationReminders,
  sendWeeklyDigests,
} from './digest.service.js';
import {
  dispatchPendingEvents,
  prunePublishedOutbox,
} from '../platform/outbox/outbox.dispatcher.js';
import {
  JOB_NAMES,
  QUEUE_NAMES,
  closeQueues,
  getQueue,
  inspectQueues,
  registerWorker,
} from '../platform/queue/queue.registry.js';

const log = createModuleLogger('workers');

/** Shape of a `dispatch-domain-event` job, as enqueued by the outbox dispatcher. */
interface DomainEventJobData {
  eventId: string;
  eventKey: string;
  aggregateType: string;
  aggregateId: string;
  organisationId?: string;
  payload: unknown;
  occurredAt: string;
  attempts: number;
}

/**
 * The outbox sweep runs on this interval. It is the heartbeat of the whole
 * asynchronous path: every domain side effect is ultimately driven by it, so it
 * is scheduled by the worker (never the API) and kept short enough that a
 * business action's follow-up work starts within a few seconds.
 */
const OUTBOX_SWEEP_INTERVAL_MS = 5_000;
const OUTBOX_SWEEP_BATCH_SIZE = 50;

/**
 * Domain events.
 *
 * Handlers are registered by importing the modules that own them; an event with
 * no handlers is not an error, because many events exist only for audit and
 * future use. A partial failure is rethrown so BullMQ retries the event — every
 * handler must therefore be idempotent, which the outbox contract already
 * requires for at-least-once delivery.
 */
function registerDomainEventWorker(): void {
  registerWorker(
    QUEUE_NAMES.DOMAIN_EVENTS,
    async (job: Job) => {
      const data = job.data as DomainEventJobData;

      if (!isKnownEventKey(data.eventKey)) {
        // The dispatcher validates before enqueueing, so reaching here means the
        // catalogue changed under a job that was already queued. Fail loudly
        // rather than silently dropping the event.
        throw new Error(`Unknown domain event key: ${data.eventKey}`);
      }

      const result = await dispatchDomainEvent({
        id: data.eventId,
        key: data.eventKey,
        aggregateType: data.aggregateType,
        aggregateId: data.aggregateId,
        ...(data.organisationId ? { organisationId: data.organisationId } : {}),
        payload: data.payload,
        occurredAt: new Date(data.occurredAt),
        attempts: data.attempts,
      });

      if (result.failures.length > 0) {
        throw new Error(
          `${result.failures.length} handler(s) failed for ${data.eventKey}: ` +
            result.failures.map((failure) => failure.handler).join(', '),
        );
      }
    },
    { concurrency: 10 },
  );
}

/** Transactional email delivery, including the delivery record's status. */
function registerEmailWorker(): void {
  registerWorker(
    QUEUE_NAMES.EMAIL,
    async (job: Job) => {
      await deliverEmail(job.data as EmailJobPayload);
    },
    { concurrency: 10 },
  );
}

function registerFileWorker(): void {
  registerWorker(
    QUEUE_NAMES.FILES,
    async (job: Job) => {
      if (job.name !== JOB_NAMES.SCAN_FILE) throw new Error(`No file handler for job: ${job.name}`);
      const data = job.data as { fileId?: unknown };
      if (typeof data.fileId !== 'string') throw new Error('File scan job is missing fileId.');
      await processFileScan(data.fileId);
    },
    { concurrency: 4 },
  );
}

function registerExportWorker(): void {
  registerWorker(
    QUEUE_NAMES.EXPORTS,
    async (job: Job) => {
      if (job.name !== JOB_NAMES.GENERATE_EXPORT) throw new Error(`No export handler for job: ${job.name}`);
      const data = job.data as { exportRequestId?: unknown };
      if (typeof data.exportRequestId !== 'string') throw new Error('Export job is missing exportRequestId.');
      await processExport(data.exportRequestId);
    },
    { concurrency: 2 },
  );
}

function registerReminderWorker(): void {
  registerWorker(QUEUE_NAMES.REMINDERS, processReminder, { concurrency: 5 });
}

/**
 * Housekeeping.
 *
 * Single-concurrency: the sweeps are cheap and serialising them avoids two
 * instances claiming the same outbox batch and contending on the same rows
 * (the SQL already guards against this, but there is no reason to try).
 */
function registerMaintenanceWorker(): void {
  registerWorker(
    QUEUE_NAMES.MAINTENANCE,
    async (job: Job) => {
      switch (job.name) {
        case JOB_NAMES.SWEEP_OUTBOX: {
          const summary = await dispatchPendingEvents(OUTBOX_SWEEP_BATCH_SIZE);
          if (summary.claimed > 0) {
            log.info(summary, 'outbox swept');
          }
          return;
        }
        case JOB_NAMES.PRUNE_SESSIONS: {
          const pruned = await pruneExpiredSessions(30);
          log.info({ pruned }, 'expired sessions pruned');
          return;
        }
        case JOB_NAMES.PRUNE_OUTBOX: {
          const pruned = await prunePublishedOutbox(7);
          log.info({ pruned }, 'published outbox events pruned');
          return;
        }
        case JOB_NAMES.DELETE_EXPIRED_EXPORTS: {
          const expired = await expireExports();
          log.info({ expired }, 'expired exports deleted');
          return;
        }
        case JOB_NAMES.EXPIRE_STALE_OFFERS: {
          const expired = await expireStaleOffers();
          log.info({ expired }, 'stale offers expired');
          return;
        }
        case JOB_NAMES.ACTIVATE_DUE_PLACEMENTS: {
          const activated = await activateDuePlacements();
          log.info({ activated }, 'due placements activated');
          return;
        }
        case JOB_NAMES.SCAN_DUE_REMINDERS: {
          const queued = await scanDueReminders();
          if (queued.calendar > 0 || queued.tasks > 0) log.info(queued, 'due reminders queued');
          return;
        }
        case JOB_NAMES.SEND_DIGEST: {
          const staged = await sendWeeklyDigests();
          if (staged > 0) log.info({ staged }, 'weekly digests staged');
          return;
        }
        case JOB_NAMES.CHECK_EXPIRING_INVITATIONS: {
          const staged = await sendExpiringInvitationReminders();
          if (staged > 0) log.info({ staged }, 'invitation reminders staged');
          return;
        }
        default:
          // A job name with no handler here was scheduled by a newer deploy or
          // by hand; failing makes the gap visible instead of a silent no-op.
          throw new Error(`No maintenance handler for job: ${job.name}`);
      }
    },
    { concurrency: 1 },
  );
}

/** Periodic queue-depth sampling so the ops view reflects real backlog. */
function startQueueHealthReporter(): () => void {
  const interval = setInterval(() => {
    inspectQueues().catch((error: unknown) => {
      log.warn({ err: error }, 'failed to inspect queues');
    });
  }, 60_000);
  interval.unref();
  return () => clearInterval(interval);
}

/**
 * Install the repeatable jobs.
 *
 * `jobId` is stable per schedule so a redeploy updates the existing schedule
 * instead of stacking a duplicate one. The off-round minute marks avoid every
 * instance across the fleet running its daily work at the same instant.
 */
async function registerScheduledJobs(): Promise<void> {
  const maintenance = getQueue(QUEUE_NAMES.MAINTENANCE);

  await maintenance.add(
    JOB_NAMES.SWEEP_OUTBOX,
    {},
    {
      repeat: { every: OUTBOX_SWEEP_INTERVAL_MS },
      jobId: 'schedule-sweep-outbox',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );

  await maintenance.add(
    JOB_NAMES.DELETE_EXPIRED_EXPORTS,
    {},
    {
      repeat: { pattern: '37 3 * * *' },
      jobId: 'schedule-delete-expired-exports',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );

  await maintenance.add(
    JOB_NAMES.PRUNE_SESSIONS,
    {},
    {
      repeat: { pattern: '17 3 * * *' },
      jobId: 'schedule-prune-sessions',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );

  await maintenance.add(
    JOB_NAMES.PRUNE_OUTBOX,
    {},
    {
      repeat: { pattern: '27 3 * * *' },
      jobId: 'schedule-prune-outbox',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );

  await maintenance.add(
    JOB_NAMES.EXPIRE_STALE_OFFERS,
    {},
    {
      repeat: { pattern: '*/5 * * * *' },
      jobId: 'schedule-expire-stale-offers',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );

  await maintenance.add(
    JOB_NAMES.ACTIVATE_DUE_PLACEMENTS,
    {},
    {
      repeat: { pattern: '*/15 * * * *' },
      jobId: 'schedule-activate-due-placements',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );

  await maintenance.add(
    JOB_NAMES.SCAN_DUE_REMINDERS,
    {},
    {
      repeat: { pattern: '*/5 * * * *' },
      jobId: 'schedule-scan-due-reminders',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );

  await maintenance.add(
    JOB_NAMES.SEND_DIGEST,
    {},
    {
      repeat: { pattern: '0 7 * * 1' },
      jobId: 'schedule-send-weekly-digest',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );

  await maintenance.add(
    JOB_NAMES.CHECK_EXPIRING_INVITATIONS,
    {},
    {
      repeat: { pattern: '17 8 * * *' },
      jobId: 'schedule-check-expiring-invitations',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );

  log.info('scheduled jobs registered');
}

/**
 * Start every processor and repeatable job. Returns a teardown function so the
 * entry point can stop the reporter before the queues are closed.
 */
export async function startWorkers(): Promise<{ stop: () => Promise<void> }> {
  registerNotificationEventHandlers();
  registerEmailEventHandlers();
  registerDomainEventWorker();
  registerEmailWorker();
  registerFileWorker();
  registerExportWorker();
  registerReminderWorker();
  registerMaintenanceWorker();

  await registerScheduledJobs();

  const stopHealthReporter = startQueueHealthReporter();

  return {
    async stop(): Promise<void> {
      stopHealthReporter();
      await closeQueues();
    },
  };
}
