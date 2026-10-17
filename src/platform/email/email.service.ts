import type { Prisma } from '@prisma/client';
import { loadConfig } from '../../config/index.js';
import { getPrisma } from '../../database/prisma.js';
import { createModuleLogger } from '../../common/logging/logger.js';
import { increment, MetricName } from '../../common/observability/metrics.js';
import { decryptField, encryptField } from '../../common/security/encryption.js';
import {
  enqueue,
  isQueueingEnabled,
  JOB_NAMES,
  QUEUE_NAMES,
  stableJobId,
} from '../queue/queue.registry.js';
import {
  CaptureEmailAdapter,
  LogEmailAdapter,
  ResendEmailAdapter,
  SmtpEmailAdapter,
} from './email.adapters.js';
import { SesEmailAdapter } from './ses.adapter.js';
import { renderEmail } from './templates.js';
import {
  EMAIL_TEMPLATES,
  type EmailAdapter,
  type EmailTemplateKey,
  type TemplateVariables,
} from './email.types.js';
import { EVENT_KEYS } from '../events/event-catalog.js';
import { emitEvent } from '../outbox/outbox.service.js';

const log = createModuleLogger('email');

let adapter: EmailAdapter | undefined;

export function getEmailAdapter(): EmailAdapter {
  if (adapter) return adapter;
  const provider = loadConfig().email.provider;
  switch (provider) {
    case 'capture':
      adapter = new CaptureEmailAdapter();
      break;
    case 'smtp':
      adapter = new SmtpEmailAdapter();
      break;
    case 'resend':
      adapter = new ResendEmailAdapter();
      break;
    case 'ses':
      adapter = new SesEmailAdapter();
      break;
    case 'log':
    default:
      adapter = new LogEmailAdapter();
      break;
  }
  log.info({ provider: adapter.name }, 'email adapter initialised');
  return adapter;
}

export function resetEmailAdapter(): void {
  adapter = undefined;
}

export interface SendEmailInput {
  to: string;
  toName?: string | undefined;
  template: EmailTemplateKey;
  variables: TemplateVariables;
  organisationId?: string | undefined;
  replyTo?: string | undefined;
  /** Stable business key used by outbox subscribers to make delivery creation idempotent. */
  dedupeKey?: string | undefined;
}

interface StoredEmailPayload {
  version: 1;
  deliveryId: string;
  to: string;
  toName?: string;
  template: EmailTemplateKey;
  variables: TemplateVariables;
  organisationId?: string;
  replyTo?: string;
}

export interface EmailJobPayload {
  deliveryId: string;
}

type EmailIntentClient = Pick<Prisma.TransactionClient, 'emailDelivery' | 'outboxEvent'>;

function storedPayload(deliveryId: string, input: SendEmailInput): StoredEmailPayload {
  return {
    version: 1,
    deliveryId,
    to: input.to,
    ...(input.toName ? { toName: input.toName } : {}),
    template: input.template,
    variables: input.variables,
    ...(input.organisationId ? { organisationId: input.organisationId } : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  };
}

function readStoredPayload(deliveryId: string, encrypted: string | null): StoredEmailPayload {
  if (!encrypted) throw new Error(`Email delivery ${deliveryId} has no stored payload.`);
  const parsed = JSON.parse(decryptField(encrypted)) as Partial<StoredEmailPayload>;
  if (
    parsed.version !== 1 ||
    parsed.deliveryId !== deliveryId ||
    typeof parsed.to !== 'string' ||
    typeof parsed.template !== 'string' ||
    !Object.values(EMAIL_TEMPLATES).includes(parsed.template) ||
    !parsed.variables ||
    typeof parsed.variables !== 'object'
  ) {
    throw new Error(`Email delivery ${deliveryId} has an invalid stored payload.`);
  }
  return parsed as StoredEmailPayload;
}

/**
 * Persist an encrypted email intent and its outbox event in the caller's
 * transaction. Raw verification/reset/invitation tokens never enter an event
 * or Redis payload; both layers carry only the delivery UUID.
 */
export async function stageEmail(
  client: EmailIntentClient,
  input: SendEmailInput,
): Promise<string> {
  const rendered = renderEmail(input.template, input.variables);
  const dedupeKey = input.dedupeKey?.slice(0, 255);
  const existing = dedupeKey
    ? await client.emailDelivery.findUnique({ where: { dedupeKey } })
    : null;
  // PENDING means the email-request outbox row was committed with this intent.
  // Re-emitting would only create duplicate domain jobs; FAILED is deliberately
  // re-staged so an explicit retry can produce a fresh request event.
  if (existing && ['PENDING', 'SENT'].includes(existing.status)) return existing.id;

  const common = {
    organisationId: input.organisationId ?? null,
    templateKey: input.template,
    recipientEmail: input.to.slice(0, 254),
    subject: rendered.subject.slice(0, 300),
    provider: getEmailAdapter().name,
    status: 'PENDING' as const,
    errorCode: null,
    errorMessage: null,
  };
  const delivery = existing
    ? await client.emailDelivery.update({
        where: { id: existing.id },
        data: common,
      })
    : await client.emailDelivery.create({
        data: { ...common, dedupeKey: dedupeKey ?? null },
      });

  await client.emailDelivery.update({
    where: { id: delivery.id },
    data: { payloadEncrypted: encryptField(JSON.stringify(storedPayload(delivery.id, input))) },
  });
  await emitEvent(client, {
    eventKey: EVENT_KEYS.EMAIL_DELIVERY_REQUESTED,
    aggregateType: 'EmailDelivery',
    aggregateId: delivery.id,
    organisationId: input.organisationId ?? null,
    payload: { deliveryId: delivery.id },
  });
  return delivery.id;
}

/**
 * Queue a transactional email.
 *
 * The delivery row is written first so an email that is queued but never
 * delivered leaves a visible PENDING record rather than disappearing. The job
 * id is the delivery id, so enqueueing the same email twice is a no-op.
 */
export async function enqueueEmail(input: SendEmailInput): Promise<string | undefined> {
  const prisma = getPrisma();
  const deliveryId = await prisma.$transaction((tx) => stageEmail(tx, input));

  if (!isQueueingEnabled()) {
    await deliverEmail({ deliveryId });
  }
  return deliveryId;
}

/** Publish a previously staged delivery. Called only by the outbox subscriber. */
export async function enqueueStoredEmail(deliveryId: string): Promise<string | undefined> {
  const delivery = await getPrisma().emailDelivery.findUnique({
    where: { id: deliveryId },
    select: { id: true, status: true, payloadEncrypted: true },
  });
  if (!delivery) throw new Error(`Email delivery ${deliveryId} was not found.`);
  if (delivery.status === 'SENT') return delivery.id;
  // Validate/decrypt before acknowledging the domain event.
  readStoredPayload(delivery.id, delivery.payloadEncrypted);
  if (!isQueueingEnabled()) {
    await deliverEmail({ deliveryId });
    return deliveryId;
  }
  return enqueue(QUEUE_NAMES.EMAIL, JOB_NAMES.DELIVER_EMAIL, { deliveryId }, {
    jobId: stableJobId('email', deliveryId),
  });
}

/**
 * Render and deliver one email, then record the outcome.
 *
 * Throwing on failure is deliberate: BullMQ retries the job, and the delivery
 * row keeps an attempt count so an operator can see a permanently failing
 * address rather than a silent black hole.
 */
export async function deliverEmail(payload: EmailJobPayload): Promise<void> {
  const prisma = getPrisma();
  const instance = getEmailAdapter();
  const config = loadConfig();
  const delivery = await prisma.emailDelivery.findUnique({
    where: { id: payload.deliveryId },
    select: { id: true, status: true, payloadEncrypted: true },
  });
  if (!delivery) throw new Error(`Email delivery ${payload.deliveryId} was not found.`);
  if (delivery.status === 'SENT') return;
  const stored = readStoredPayload(delivery.id, delivery.payloadEncrypted);

  await prisma.emailDelivery.updateMany({
    where: { id: payload.deliveryId },
    data: { attempts: { increment: 1 }, provider: instance.name },
  });

  const rendered = renderEmail(stored.template, stored.variables);

  try {
    const result = await instance.send({
      to: stored.to,
      toName: stored.toName,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: stored.replyTo ?? config.email.fromAddress,
      tags: { template: stored.template },
    });

    await prisma.emailDelivery.update({
      where: { id: payload.deliveryId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        providerRef: result.providerRef ?? null,
        errorCode: null,
        errorMessage: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    increment(MetricName.EMAIL_FAILURE, { template: stored.template });

    await prisma.emailDelivery
      .update({
        where: { id: payload.deliveryId },
        data: {
          status: 'FAILED',
          errorCode: 'EMAIL_DELIVERY_FAILED',
          errorMessage: message.slice(0, 1000),
        },
      })
      .catch((updateError: unknown) => {
        log.error({ err: updateError }, 'failed to record email delivery failure');
      });

    log.error({ err: error, to: stored.to, template: stored.template }, 'email delivery failed');
    throw error;
  }
}

export { EMAIL_TEMPLATES };
export type { EmailTemplateKey, TemplateVariables } from './email.types.js';
