import type { FeatureFlagScope, Prisma } from '@prisma/client';
import { NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getPrisma } from '../../database/prisma.js';
import { recordAdministrativeAction } from '../../platform/audit/audit.service.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import {
  getQueue,
  inspectQueues,
  type QueueName,
  QUEUE_NAMES,
} from '../../platform/queue/queue.registry.js';
import type { AuthContext } from '../auth/index.js';
function requirePermission(auth: AuthContext, permission: string) {
  if (!auth.platformPermissions.has(permission))
    throw new NotFoundError(ErrorCode.NOT_FOUND, 'That resource was not found.');
}
export async function listConfiguration(auth: AuthContext) {
  requirePermission(auth, 'config:read');
  const [featureFlags, policies] = await Promise.all([
    getPrisma().featureFlag.findMany({ orderBy: [{ key: 'asc' }, { scope: 'asc' }] }),
    getPrisma().policyConfiguration.findMany({
      orderBy: [{ key: 'asc' }, { organisationId: 'asc' }],
    }),
  ]);
  return { featureFlags, policies };
}
export async function setFeatureFlag(
  auth: AuthContext,
  input: {
    key: string;
    scope: FeatureFlagScope;
    organisationId?: string | null;
    enabled: boolean;
    description?: string | null;
    rolloutPercentage: number;
    reason: string;
  },
) {
  requirePermission(auth, 'admin:manage_flags');
  if (input.scope === 'ORGANISATION' && !input.organisationId)
    throw new UnprocessableError(
      ErrorCode.CONFIG_VALUE_INVALID,
      'Organisation flags require organisationId.',
    );
  if (input.scope === 'GLOBAL' && input.organisationId)
    throw new UnprocessableError(
      ErrorCode.CONFIG_VALUE_INVALID,
      'Global flags cannot have organisationId.',
    );
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.featureFlag.findFirst({
      where: { key: input.key, scope: input.scope, organisationId: input.organisationId ?? null },
    });
    const flag = current
      ? await tx.featureFlag.update({
          where: { id: current.id },
          data: {
            enabled: input.enabled,
            description: input.description,
            rolloutPercentage: input.rolloutPercentage,
          },
        })
      : await tx.featureFlag.create({
          data: {
            key: input.key,
            scope: input.scope,
            organisationId: input.organisationId ?? null,
            enabled: input.enabled,
            description: input.description,
            rolloutPercentage: input.rolloutPercentage,
          },
        });
    await recordAdministrativeAction(
      {
        action: 'CONFIGURE',
        resourceType: 'FeatureFlag',
        resourceId: flag.id,
        organisationId: flag.organisationId,
        summary: `Configured feature flag ${flag.key}`,
        reason: input.reason,
      },
      tx,
    );
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.FEATURE_FLAG_CHANGED,
      aggregateType: 'FeatureFlag',
      aggregateId: flag.id,
      organisationId: flag.organisationId,
      payload: { featureFlagId: flag.id, key: flag.key },
    });
    return flag;
  });
}
function validateKnownPolicy(key: string, value: unknown) {
  if (key === 'replacement_window_days') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 365)
      throw new UnprocessableError(
        ErrorCode.CONFIG_VALUE_INVALID,
        'replacement_window_days must be an integer from 1 to 365.',
      );
  } else if (key === 'annual_work_hours') {
    if (typeof value !== 'number' || value < 1 || value > 8784)
      throw new UnprocessableError(
        ErrorCode.CONFIG_VALUE_INVALID,
        'annual_work_hours must be a positive number no greater than 8784.',
      );
  } else if (key.endsWith('_retention_days')) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 3650)
      throw new UnprocessableError(
        ErrorCode.CONFIG_VALUE_INVALID,
        'Retention days must be an integer from 1 to 3650.',
      );
  }
}
export async function setPolicy(
  auth: AuthContext,
  input: {
    key: string;
    organisationId?: string | null;
    value?: unknown;
    description?: string | null;
    reason: string;
  },
) {
  requirePermission(auth, 'admin:manage_policy');
  if (input.value === undefined)
    throw new UnprocessableError(ErrorCode.CONFIG_VALUE_INVALID, 'A policy value is required.');
  validateKnownPolicy(input.key, input.value);
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.policyConfiguration.findFirst({
      where: { key: input.key, organisationId: input.organisationId ?? null },
    });
    const data = {
      value: input.value as Prisma.InputJsonValue,
      description: input.description,
      updatedById: auth.userId,
    };
    const policy = current
      ? await tx.policyConfiguration.update({ where: { id: current.id }, data })
      : await tx.policyConfiguration.create({
          data: { key: input.key, organisationId: input.organisationId ?? null, ...data },
        });
    await recordAdministrativeAction(
      {
        action: 'CONFIGURE',
        resourceType: 'PolicyConfiguration',
        resourceId: policy.id,
        organisationId: policy.organisationId,
        summary: `Configured policy ${policy.key}`,
        reason: input.reason,
      },
      tx,
    );
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.POLICY_CHANGED,
      aggregateType: 'PolicyConfiguration',
      aggregateId: policy.id,
      organisationId: policy.organisationId,
      payload: { policyId: policy.id, key: policy.key },
    });
    return policy;
  });
}
export async function createAnnouncement(
  auth: AuthContext,
  input: {
    organisationId?: string | null;
    title: string;
    body: string;
    audience: string;
    expiresAt?: Date | null;
    publish: boolean;
    reason: string;
  },
) {
  requirePermission(auth, 'admin:manage_announcement');
  return getPrisma().$transaction(async (tx) => {
    const announcement = await tx.announcement.create({
      data: {
        organisationId: input.organisationId ?? null,
        title: input.title,
        body: input.body,
        audience: input.audience,
        expiresAt: input.expiresAt,
        publishedAt: input.publish ? new Date() : null,
        createdById: auth.userId,
      },
    });
    if (input.publish) {
      const users = input.organisationId
        ? await tx.organisationMembership.findMany({
            where: { organisationId: input.organisationId, status: 'ACTIVE' },
            select: { userId: true },
          })
        : input.audience === 'TALENT'
          ? await tx.talentProfile.findMany({
              where: { user: { status: 'ACTIVE' } },
              select: { userId: true },
            })
          : await tx.user
              .findMany({ where: { status: 'ACTIVE' }, select: { id: true } })
              .then((rows) => rows.map((row) => ({ userId: row.id })));
      if (users.length)
        await tx.notification.createMany({
          data: users.map((user) => ({
            userId: user.userId,
            organisationId: input.organisationId ?? null,
            eventKey: EVENT_KEYS.ANNOUNCEMENT_PUBLISHED,
            title: input.title,
            body: input.body,
            payload: { announcementId: announcement.id },
          })),
        });
      await emitEvent(tx, {
        eventKey: EVENT_KEYS.ANNOUNCEMENT_PUBLISHED,
        aggregateType: 'Announcement',
        aggregateId: announcement.id,
        organisationId: input.organisationId ?? null,
        payload: { announcementId: announcement.id },
      });
    }
    await recordAdministrativeAction(
      {
        action: 'CREATE',
        resourceType: 'Announcement',
        resourceId: announcement.id,
        organisationId: input.organisationId ?? null,
        summary: `Created announcement ${announcement.title}`,
        reason: input.reason,
      },
      tx,
    );
    return announcement;
  });
}

export async function listAnnouncements(
  auth: AuthContext,
  query: { page: number; pageSize: number; status?: 'DRAFT' | 'PUBLISHED' | 'EXPIRED' },
) {
  requirePermission(auth, 'admin:manage_announcement');
  const now = new Date();
  const where: Prisma.AnnouncementWhereInput =
    query.status === 'DRAFT'
      ? { publishedAt: null }
      : query.status === 'EXPIRED'
        ? { expiresAt: { lte: now } }
        : query.status === 'PUBLISHED'
          ? { publishedAt: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
          : {};
  const [items, total] = await Promise.all([
    getPrisma().announcement.findMany({
      where,
      include: {
        organisation: { select: { id: true, name: true } },
        _count: { select: { deliveries: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    getPrisma().announcement.count({ where }),
  ]);
  return { items, total };
}

export async function listDeliveries(
  auth: AuthContext,
  query: {
    page: number;
    pageSize: number;
    status?: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  },
) {
  requirePermission(auth, 'ops:read');
  const where: Prisma.EmailDeliveryWhereInput = query.status ? { status: query.status } : {};
  const [items, total] = await Promise.all([
    getPrisma().emailDelivery.findMany({
      where,
      select: {
        id: true,
        templateKey: true,
        recipientEmail: true,
        provider: true,
        providerRef: true,
        status: true,
        attempts: true,
        errorCode: true,
        errorMessage: true,
        sentAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    getPrisma().emailDelivery.count({ where }),
  ]);
  return { items, total };
}

export async function retryDelivery(auth: AuthContext, id: string, reason: string) {
  requirePermission(auth, 'ops:retry_job');
  return getPrisma().$transaction(async (tx) => {
    const delivery = await tx.emailDelivery.findUnique({ where: { id } });
    if (!delivery || delivery.status !== 'FAILED') {
      throw new NotFoundError(ErrorCode.NOT_FOUND, 'That failed delivery was not found.');
    }
    const updated = await tx.emailDelivery.update({
      where: { id },
      data: { status: 'PENDING', errorCode: null, errorMessage: null },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.EMAIL_DELIVERY_REQUESTED,
      aggregateType: 'EmailDelivery',
      aggregateId: id,
      organisationId: delivery.organisationId,
      payload: { deliveryId: id },
    });
    await recordAdministrativeAction(
      {
        action: 'RETRY',
        resourceType: 'EmailDelivery',
        resourceId: id,
        organisationId: delivery.organisationId,
        summary: `Retried ${delivery.templateKey} email delivery`,
        reason,
      },
      tx,
    );
    return updated;
  });
}

export async function operations(
  auth: AuthContext,
  query: {
    page: number;
    pageSize: number;
    status?: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'DEAD_LETTERED';
  },
) {
  requirePermission(auth, 'ops:read');
  const where: Prisma.BackgroundJobOutcomeWhereInput = {
    ...(query.status ? { status: query.status } : {}),
  };
  const [outcomes, total, queues, outboxFailures, emailFailures] = await Promise.all([
    getPrisma().backgroundJobOutcome.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    getPrisma().backgroundJobOutcome.count({ where }),
    inspectQueues(),
    getPrisma().outboxEvent.count({ where: { status: 'FAILED' } }),
    getPrisma().emailDelivery.count({ where: { status: 'FAILED' } }),
  ]);
  return { outcomes, total, queues, failures: { outbox: outboxFailures, email: emailFailures } };
}
export async function retryJob(auth: AuthContext, id: string, reason: string) {
  requirePermission(auth, 'ops:retry_job');
  const outcome = await getPrisma().backgroundJobOutcome.findUnique({ where: { id } });
  if (!outcome || !outcome.jobId || !['FAILED', 'DEAD_LETTERED'].includes(outcome.status))
    throw new NotFoundError(
      ErrorCode.BACKGROUND_JOB_NOT_FOUND,
      'That retryable job was not found.',
    );
  if (!Object.values(QUEUE_NAMES).includes(outcome.queue as QueueName))
    throw new UnprocessableError(
      ErrorCode.JOB_NOT_RETRYABLE,
      'That job queue is no longer available.',
    );
  const job = await getQueue(outcome.queue as QueueName).getJob(outcome.jobId);
  if (!job)
    throw new NotFoundError(ErrorCode.BACKGROUND_JOB_NOT_FOUND, 'The queued job has expired.');
  await job.retry();
  await getPrisma().$transaction(async (tx) => {
    await tx.backgroundJobOutcome.update({
      where: { id },
      data: {
        status: 'QUEUED',
        retriedAt: new Date(),
        retriedById: auth.userId,
        errorCode: null,
        errorMessage: null,
      },
    });
    await recordAdministrativeAction(
      {
        action: 'RETRY',
        resourceType: 'BackgroundJobOutcome',
        resourceId: id,
        organisationId: outcome.organisationId,
        summary: `Retried ${outcome.jobName}`,
        reason,
      },
      tx,
    );
  });
  return { id, status: 'QUEUED' };
}
