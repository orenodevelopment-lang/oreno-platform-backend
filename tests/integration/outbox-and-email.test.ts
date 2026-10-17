import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../src/database/prisma.js';
import { dispatchPendingEvents } from '../../src/platform/outbox/outbox.dispatcher.js';
import { stageEmail, enqueueStoredEmail } from '../../src/platform/email/email.service.js';
import { EMAIL_TEMPLATES } from '../../src/platform/email/email.types.js';
import {
  getQueue,
  enqueue,
  JOB_NAMES,
  QUEUE_NAMES,
  registerWorker,
  stableJobId,
} from '../../src/platform/queue/queue.registry.js';
import { suffix } from '../helpers/factories.js';

describe('outbox crash recovery and sensitive email delivery', () => {
  it('recovers stale claims, ignores live claims, and collapses a replay onto one queue job', async () => {
    const prisma = getPrisma();
    const aggregateId = crypto.randomUUID();
    const stale = await prisma.outboxEvent.create({
      data: {
        eventKey: 'task.status_changed',
        aggregateType: 'Task',
        aggregateId,
        payload: { taskId: aggregateId },
        status: 'PUBLISHING',
        attempts: 1,
        claimedAt: new Date(Date.now() - 3 * 60_000),
      },
    });
    const live = await prisma.outboxEvent.create({
      data: {
        eventKey: 'task.status_changed',
        aggregateType: 'Task',
        aggregateId: crypto.randomUUID(),
        payload: { taskId: crypto.randomUUID() },
        status: 'PUBLISHING',
        claimedAt: new Date(),
      },
    });

    await Promise.all([dispatchPendingEvents(250), dispatchPendingEvents(250)]);
    const [publishedStale, untouchedLive] = await Promise.all([
      prisma.outboxEvent.findUniqueOrThrow({ where: { id: stale.id } }),
      prisma.outboxEvent.findUniqueOrThrow({ where: { id: live.id } }),
    ]);
    expect(publishedStale).toMatchObject({ status: 'PUBLISHED', attempts: 2, claimedAt: null });
    expect(untouchedLive.status).toBe('PUBLISHING');

    const jobId = stableJobId('outbox', stale.id);
    expect(await getQueue(QUEUE_NAMES.DOMAIN_EVENTS).getJob(jobId)).not.toBeUndefined();
    expect(
      await prisma.backgroundJobOutcome.count({
        where: { queue: QUEUE_NAMES.DOMAIN_EVENTS, jobId },
      }),
    ).toBe(1);

    // Simulate a process dying after BullMQ accepted the job but before the
    // PUBLISHED update. The stale re-claim uses the same deterministic job id.
    await prisma.outboxEvent.update({
      where: { id: stale.id },
      data: {
        status: 'PUBLISHING',
        claimedAt: new Date(Date.now() - 3 * 60_000),
        publishedAt: null,
      },
    });
    await dispatchPendingEvents(250);
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe(
      'PUBLISHED',
    );
    expect(
      await prisma.backgroundJobOutcome.count({
        where: { queue: QUEUE_NAMES.DOMAIN_EVENTS, jobId },
      }),
    ).toBe(1);
  });

  it('stores token-bearing email input encrypted and sends only the delivery id to queues', async () => {
    const prisma = getPrisma();
    const rawToken = `secret-${suffix()}`;
    const deliveryId = await prisma.$transaction((tx) =>
      stageEmail(tx, {
        to: `email-${suffix()}@example.test`,
        template: EMAIL_TEMPLATES.PASSWORD_RESET,
        variables: {
          firstName: 'Test',
          resetUrl: `https://app.example.test/reset-password?token=${rawToken}`,
        },
        dedupeKey: `durable-email-${suffix()}`,
      }),
    );

    const [delivery, intent] = await Promise.all([
      prisma.emailDelivery.findUniqueOrThrow({ where: { id: deliveryId } }),
      prisma.outboxEvent.findFirstOrThrow({
        where: { eventKey: 'email.delivery_requested', aggregateId: deliveryId },
      }),
    ]);
    expect(delivery.payloadEncrypted).toBeTruthy();
    expect(JSON.stringify(delivery)).not.toContain(rawToken);
    expect(intent.payload).toEqual({ deliveryId });
    expect(JSON.stringify(intent)).not.toContain(rawToken);

    await enqueueStoredEmail(deliveryId);
    const job = await getQueue(QUEUE_NAMES.EMAIL).getJob(stableJobId('email', deliveryId));
    expect(job?.data).toEqual({ deliveryId });
    expect(JSON.stringify(job?.data)).not.toContain(rawToken);
  });

  it('retries a failed queue job and records its final operational outcome', async () => {
    const jobId = stableJobId('retry-test', suffix());
    let runs = 0;
    registerWorker(
      QUEUE_NAMES.SEARCH,
      (job) => {
        if (job.id !== jobId) return Promise.resolve();
        runs += 1;
        if (runs === 1) return Promise.reject(new Error('Expected first-attempt failure.'));
        return Promise.resolve();
      },
      { concurrency: 1 },
    );
    await enqueue(
      QUEUE_NAMES.SEARCH,
      JOB_NAMES.INDEX_JOB,
      { resourceId: crypto.randomUUID() },
      { jobId, attempts: 2 },
    );

    const deadline = Date.now() + 12_000;
    let state: string | undefined;
    while (Date.now() < deadline) {
      const job = await getQueue(QUEUE_NAMES.SEARCH).getJob(jobId);
      state = await job?.getState();
      if (state === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(state).toBe('completed');
    expect(runs).toBe(2);

    let outcome = await getPrisma().backgroundJobOutcome.findUnique({
      where: { queue_jobId: { queue: QUEUE_NAMES.SEARCH, jobId } },
    });
    while (outcome?.status !== 'SUCCEEDED' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      outcome = await getPrisma().backgroundJobOutcome.findUnique({
        where: { queue_jobId: { queue: QUEUE_NAMES.SEARCH, jobId } },
      });
    }
    expect(outcome).toMatchObject({ status: 'SUCCEEDED', attempts: 2 });
  }, 20_000);
});
