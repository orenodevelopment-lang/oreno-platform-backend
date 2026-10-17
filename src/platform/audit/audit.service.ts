import type { AuditAction, AuditOutcome, Prisma } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';
import { getContext } from '../../common/logging/context.js';
import { redact } from '../../common/logging/redaction.js';
import { createModuleLogger } from '../../common/logging/logger.js';

const log = createModuleLogger('audit');

/**
 * Append-only audit trail.
 *
 * `AuditEvent` is never updated or deleted by the application. A database rule
 * installed by the migration rejects UPDATE and DELETE outright, so even a
 * future bug or a careless migration cannot rewrite history.
 *
 * Callers should pass the surrounding transaction when the audit entry must be
 * atomic with the change it describes — a permission change that is audited but
 * not applied, or applied but not audited, is worse than either alone.
 */
export type AuditClient = Pick<Prisma.TransactionClient, 'auditEvent'>;

export interface AuditEventInput {
  action: AuditAction;
  resourceType: string;
  summary: string;
  outcome?: AuditOutcome;
  resourceId?: string | null | undefined;
  organisationId?: string | null | undefined;
  actorId?: string | null | undefined;
  actorType?: string;
  reason?: string | null | undefined;
  /** Field-level change summary. Redacted before it is stored. */
  changes?: Record<string, unknown> | undefined;
  impersonatedByUserId?: string | null | undefined;
}

export async function recordAudit(input: AuditEventInput, client?: AuditClient): Promise<void> {
  const context = getContext();
  const db = client ?? getPrisma();

  const actorId = input.actorId !== undefined ? input.actorId : (context?.userId ?? null);
  const impersonatedByUserId =
    input.impersonatedByUserId !== undefined
      ? input.impersonatedByUserId
      : (context?.impersonatedByUserId ?? null);

  try {
    await db.auditEvent.create({
      data: {
        actorId: actorId ?? null,
        actorType: input.actorType ?? 'USER',
        organisationId: input.organisationId ?? context?.organisationId ?? null,
        action: input.action,
        outcome: input.outcome ?? 'SUCCESS',
        resourceType: input.resourceType.slice(0, 80),
        resourceId: input.resourceId ?? null,
        summary: input.summary.slice(0, 1000),
        reason: input.reason?.slice(0, 1000) ?? null,
        changes: input.changes ? (redact(input.changes) as Prisma.InputJsonValue) : undefined,
        requestId: context?.requestId ?? null,
        ipAddress: context?.ip ?? null,
        userAgent: context?.userAgent?.slice(0, 512) ?? null,
        impersonatedByUserId: impersonatedByUserId ?? null,
      },
    });
  } catch (error) {
    // An audit write failure must be loud but must not silently discard the
    // business change that already committed in a separate transaction.
    log.error(
      {
        err: error,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
      },
      'failed to record audit event',
    );
    if (client) throw error;
  }
}

/**
 * Build a field-level change summary containing only keys whose values differ.
 * Sensitive fields are redacted by `recordAudit` before persistence, so it is
 * safe to pass whole entity snapshots here.
 */
export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> | undefined {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const previous = before[key];
    const next = after[key];
    if (!shallowEqual(previous, next)) {
      changes[key] = { from: previous ?? null, to: next ?? null };
    }
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/** Convenience wrapper for the common "administrator changed something" case. */
export async function recordAdministrativeAction(
  input: AuditEventInput & { reason: string },
  client?: AuditClient,
): Promise<void> {
  await recordAudit({ ...input, reason: input.reason, actorType: 'PLATFORM_ADMIN' }, client);
}

/** Convenience wrapper for a denied attempt, which is still worth recording. */
export async function recordDenied(
  input: Omit<AuditEventInput, 'outcome'>,
  client?: AuditClient,
): Promise<void> {
  await recordAudit({ ...input, outcome: 'DENIED' }, client);
}
