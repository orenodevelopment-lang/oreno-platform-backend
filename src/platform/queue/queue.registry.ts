import { Queue, Worker, type Job, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { loadConfig } from '../../config/index.js';
import { getKeyValue } from '../../database/key-value.js';
import { getKeyValueSubscriber } from '../../database/key-value.js';
import { getPrisma } from '../../database/prisma.js';
import { createModuleLogger } from '../../common/logging/logger.js';
import { increment, setGauge, MetricName } from '../../common/observability/metrics.js';
import { DependencyUnavailableError } from '../../common/errors/app-error.js';

const log = createModuleLogger('queue');

/**
 * Queue topology.
 *
 * Queues are separated by failure domain rather than by module: a flood of
 * export jobs must not delay a password-reset email, and a retry policy that
 * suits an email is wrong for a payroll calculation.
 */
export const QUEUE_NAMES = {
  /** Outbox events fanned out to their registered handlers. */
  DOMAIN_EVENTS: 'domain-events',
  /** Transactional email delivery and its delivery record. */
  EMAIL: 'email',
  /** In-app and push notification fan-out. */
  NOTIFICATIONS: 'notifications',
  /** File scanning, derivative generation and orphan cleanup. */
  FILES: 'files',
  /** CSV/XLSX generation for user-requested exports. */
  EXPORTS: 'exports',
  /** Full-text search index synchronisation. */
  SEARCH: 'search',
  /** Candidate matching recomputation. */
  MATCHING: 'matching',
  /** Interview, task, offer and calendar reminders. */
  REMINDERS: 'reminders',
  /** Payroll calculation and period transitions. */
  PAYROLL: 'payroll',
  /** Periodic housekeeping: pruning, reconciliation, digest emails. */
  MAINTENANCE: 'maintenance',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  DELIVER_EMAIL: 'deliver-email',
  DISPATCH_DOMAIN_EVENT: 'dispatch-domain-event',
  SWEEP_OUTBOX: 'sweep-outbox',
  FAN_OUT_NOTIFICATION: 'fan-out-notification',
  SCAN_FILE: 'scan-file',
  CLEAN_ORPHANED_FILES: 'clean-orphaned-files',
  GENERATE_EXPORT: 'generate-export',
  DELETE_EXPIRED_EXPORTS: 'delete-expired-exports',
  INDEX_JOB: 'index-job',
  INDEX_TALENT: 'index-talent',
  RECOMPUTE_MATCHES: 'recompute-matches',
  SEND_REMINDER: 'send-reminder',
  SCAN_DUE_REMINDERS: 'scan-due-reminders',
  CALCULATE_PAYROLL: 'calculate-payroll',
  PRUNE_SESSIONS: 'prune-sessions',
  PRUNE_OUTBOX: 'prune-outbox',
  SEND_DIGEST: 'send-digest',
  CHECK_EXPIRING_INVITATIONS: 'check-expiring-invitations',
  EXPIRE_STALE_OFFERS: 'expire-stale-offers',
  ACTIVATE_DUE_PLACEMENTS: 'activate-due-placements',
  RECONCILE_PAYMENTS: 'reconcile-payments',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

/**
 * Build a BullMQ-compatible deterministic job id. Colons are Redis key
 * separators and are explicitly forbidden by BullMQ custom ids.
 */
export function stableJobId(prefix: string, identifier: string): string {
  const safePrefix = prefix.trim().replace(/[:\s]+/g, '-');
  const safeIdentifier = identifier.trim().replace(/[:\s]+/g, '-');
  if (!safePrefix || !safeIdentifier) throw new Error('Stable job id parts must not be empty.');
  return `${safePrefix}-${safeIdentifier}`;
}

const queues = new Map<QueueName, Queue>();
const workers: Worker[] = [];

function connection(): Redis {
  return getKeyValue();
}

export function isQueueingEnabled(): boolean {
  return loadConfig().keyValue.enabled;
}

/** Default job options by queue; overridable per enqueue call. */
function defaultJobOptions(queue: QueueName): JobsOptions {
  const base: JobsOptions = {
    removeOnComplete: { age: 3_600, count: 1_000 },
    removeOnFail: { age: 7 * 24 * 3_600 },
  };

  switch (queue) {
    case QUEUE_NAMES.DOMAIN_EVENTS:
      return { ...base, attempts: 8, backoff: { type: 'exponential', delay: 2_000 } };
    case QUEUE_NAMES.EMAIL:
      return { ...base, attempts: 5, backoff: { type: 'exponential', delay: 5_000 } };
    case QUEUE_NAMES.EXPORTS:
    case QUEUE_NAMES.PAYROLL:
      // Long-running and expensive; retrying blindly can duplicate work, so
      // these are attempted once and surfaced for an operator to retry.
      return { ...base, attempts: 1 };
    case QUEUE_NAMES.FILES:
      return { ...base, attempts: 4, backoff: { type: 'exponential', delay: 10_000 } };
    default:
      return { ...base, attempts: 5, backoff: { type: 'exponential', delay: 3_000 } };
  }
}

export function getQueue(name: QueueName): Queue {
  if (!isQueueingEnabled()) {
    throw new DependencyUnavailableError(
      'Background processing is unavailable because Key Value is not configured.',
    );
  }
  let queue = queues.get(name);
  if (!queue) {
    const prefix = loadConfig().keyValue.queuePrefix;
    queue = new Queue(name, {
      connection: connection(),
      prefix: `${prefix}:${name}`,
      defaultJobOptions: defaultJobOptions(name),
    });
    queue.on('error', (error) => log.error({ err: error, queue: name }, 'queue error'));
    queues.set(name, queue);
  }
  return queue;
}

export interface EnqueueOptions {
  delayMs?: number;
  jobId?: string;
  attempts?: number;
  priority?: number;
}

/**
 * Enqueue a job. Returns the job id, or `undefined` when queueing is disabled
 * so a caller in a degraded environment can continue without throwing.
 */
export async function enqueue(
  queue: QueueName,
  jobName: JobName,
  payload: unknown,
  options: EnqueueOptions = {},
): Promise<string | undefined> {
  if (!isQueueingEnabled()) {
    log.warn({ queue, jobName }, 'enqueue skipped: key value not configured');
    return undefined;
  }

  const job = await getQueue(queue).add(jobName, payload, {
    ...(options.delayMs ? { delay: options.delayMs } : {}),
    // A stable job id makes re-enqueueing idempotent for the same logical unit
    // of work (e.g. one email per delivery record).
    ...(options.jobId ? { jobId: options.jobId } : {}),
    ...(options.attempts ? { attempts: options.attempts } : {}),
    ...(options.priority ? { priority: options.priority } : {}),
  });
  if (!job.id) throw new Error(`BullMQ did not assign an id to ${queue}/${jobName}.`);
  const jobId = job.id;
  await getPrisma().backgroundJobOutcome.upsert({
    where: { queue_jobId: { queue, jobId } },
    create: {
      organisationId: jobOrganisationId(payload),
      queue,
      jobName,
      jobId,
      status: 'QUEUED',
    },
    update: { status: 'QUEUED', finishedAt: null, errorCode: null, errorMessage: null },
  }).catch((error: unknown) => log.warn({ err: error, queue, jobId }, 'failed to record queued job'));
  return jobId;
}

export type JobProcessor = (job: Job) => Promise<void>;

function jobOrganisationId(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('organisationId' in data)) return null;
  const value = (data as { organisationId?: unknown }).organisationId;
  return typeof value === 'string' ? value : null;
}

/** Register a worker for a queue. Called only from the worker entry point. */
export function registerWorker(
  queue: QueueName,
  processor: JobProcessor,
  options: { concurrency?: number } = {},
): Worker {
  if (!isQueueingEnabled()) {
    throw new DependencyUnavailableError(
      'Cannot start a worker because Key Value is not configured.',
    );
  }
  const prefix = loadConfig().keyValue.queuePrefix;
  const worker = new Worker(queue, processor, {
    connection: connection(),
    prefix: `${prefix}:${queue}`,
    concurrency: options.concurrency ?? 5,
    // A subscriber connection cannot issue commands, so workers get their own.
    ...(queue === QUEUE_NAMES.DOMAIN_EVENTS ? {} : {}),
    autorun: true,
  });

  worker.on('completed', (job) => {
    increment(MetricName.JOB_COMPLETED, { queue, job: job.name });
    const jobId = job.id;
    if (!jobId) return;
    void getPrisma().backgroundJobOutcome.upsert({
      where: { queue_jobId: { queue, jobId } },
      create: { organisationId: jobOrganisationId(job.data), queue, jobName: job.name, jobId, status: 'SUCCEEDED', attempts: job.attemptsMade, finishedAt: new Date() },
      update: { status: 'SUCCEEDED', attempts: job.attemptsMade, finishedAt: new Date(), errorCode: null, errorMessage: null },
    }).catch((error: unknown) => log.warn({ err: error, queue, jobId }, 'failed to record completed job'));
  });
  worker.on('failed', (job, error) => {
    increment(MetricName.JOB_FAILED, { queue, job: job?.name ?? 'unknown' });
    log.error(
      { err: error, queue, jobName: job?.name, jobId: job?.id, attempts: job?.attemptsMade },
      'job failed',
    );
    if (job?.id) void getPrisma().backgroundJobOutcome.upsert({
      where: { queue_jobId: { queue, jobId: job.id } },
      create: { organisationId: jobOrganisationId(job.data), queue, jobName: job.name, jobId: job.id, status: job.attemptsMade >= (job.opts.attempts ?? 1) ? 'DEAD_LETTERED' : 'FAILED', attempts: job.attemptsMade, errorCode: 'JOB_FAILED', errorMessage: error.message.slice(0, 2000), finishedAt: new Date() },
      update: { status: job.attemptsMade >= (job.opts.attempts ?? 1) ? 'DEAD_LETTERED' : 'FAILED', attempts: job.attemptsMade, errorCode: 'JOB_FAILED', errorMessage: error.message.slice(0, 2000), finishedAt: new Date() },
    }).catch((recordError: unknown) => log.warn({ err: recordError, queue, jobId: job.id }, 'failed to record failed job'));
  });
  worker.on('active', (job) => {
    const jobId = job.id;
    if (!jobId) return;
    void getPrisma().backgroundJobOutcome.upsert({
      where: { queue_jobId: { queue, jobId } },
      create: { organisationId: jobOrganisationId(job.data), queue, jobName: job.name, jobId, status: 'RUNNING', attempts: job.attemptsMade + 1, startedAt: new Date() },
      update: { status: 'RUNNING', attempts: job.attemptsMade + 1, startedAt: new Date(), finishedAt: null },
    }).catch((error: unknown) => log.warn({ err: error, queue, jobId }, 'failed to record active job'));
  });
  worker.on('error', (error) => log.error({ err: error, queue }, 'worker error'));

  workers.push(worker);
  log.info({ queue, concurrency: options.concurrency ?? 5 }, 'worker registered');
  return worker;
}

export interface QueueHealth {
  name: QueueName;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

export async function inspectQueues(): Promise<QueueHealth[]> {
  if (!isQueueingEnabled()) return [];
  const results: QueueHealth[] = [];
  for (const name of Object.values(QUEUE_NAMES)) {
    const counts = await getQueue(name).getJobCounts(
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed',
    );
    const health: QueueHealth = {
      name,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
    };
    setGauge(MetricName.QUEUE_DEPTH, health.waiting, { queue: name });
    results.push(health);
  }
  return results;
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([
    ...[...workers].map((worker) => worker.close()),
    ...[...queues.values()].map((queue) => queue.close()),
  ]);
  workers.length = 0;
  queues.clear();
}

/** The subscriber connection is unused by this module but kept for symmetry. */
export function queueSubscriberConnection(): Redis {
  return getKeyValueSubscriber();
}
