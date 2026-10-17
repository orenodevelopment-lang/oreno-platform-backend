import { createHash } from 'node:crypto';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';
import { ConflictError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { ValidationError } from '../../common/errors/app-error.js';
import { loadConfig } from '../../config/index.js';
import { createModuleLogger } from '../../common/logging/logger.js';

const log = createModuleLogger('idempotency');

/**
 * Idempotency for commands that are harmful to repeat.
 *
 * The client sends an `Idempotency-Key` header. The first request claims the
 * key and, on success, stores the response. A repeat with the same key and the
 * same request body returns the stored response untouched; a repeat with the
 * same key but a different body is rejected as a client bug rather than
 * silently applied.
 *
 * The record is claimed with a unique constraint rather than a read-then-write,
 * so two concurrent retries cannot both proceed.
 */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyScope {
  /** Stable identifier for the operation, e.g. `POST:/api/v1/jobs`. */
  scope: string;
  key: string;
  requestHash: string;
  userId?: string | undefined;
  organisationId?: string | undefined;
}

export type IdempotencyOutcome =
  | { state: 'acquired'; recordId: string }
  | { state: 'replayed'; statusCode: number; body: unknown }
  | { state: 'in_progress' }
  | { state: 'mismatch' };

/** Stable hash of the parts of a request that make it "the same request". */
export function hashRequest(parts: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(parts ?? null), 'utf8')
    .digest('hex');
}

export function requestFingerprint(req: Request): string {
  return hashRequest({
    method: req.method,
    path: req.baseUrl + req.path,
    params: req.params,
    query: req.query,
    // `req.body` is typed `any` by Express; hashing only needs a serialisable
    // value, so it is narrowed at the boundary rather than trusted.
    body: req.body as unknown,
  });
}

/** True when the route demands a key and the client did not supply one. */
export function requireIdempotencyKey(req: Request): string {
  const header = req.get('idempotency-key');
  if (!header || header.trim().length === 0) {
    throw new ValidationError('This request must carry an Idempotency-Key header.', {
      fieldErrors: { 'Idempotency-Key': ['A unique key is required for this operation.'] },
      details: { code: ErrorCode.IDEMPOTENCY_KEY_REQUIRED },
    });
  }
  if (header.length > 255) {
    throw new ValidationError('The Idempotency-Key header is too long.', {
      fieldErrors: { 'Idempotency-Key': ['Maximum length is 255 characters.'] },
    });
  }
  return header.trim();
}

export async function beginIdempotent(context: IdempotencyScope): Promise<IdempotencyOutcome> {
  const prisma = getPrisma();
  const expiresAt = new Date(Date.now() + DEFAULT_TTL_MS);

  try {
    const record = await prisma.idempotencyRecord.create({
      data: {
        scope: context.scope.slice(0, 120),
        key: context.key,
        requestHash: context.requestHash,
        userId: context.userId ?? null,
        organisationId: context.organisationId ?? null,
        expiresAt,
      },
      select: { id: true },
    });
    return { state: 'acquired', recordId: record.id };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  const existing = await prisma.idempotencyRecord.findUnique({
    where: { scope_key: { scope: context.scope.slice(0, 120), key: context.key } },
  });

  if (!existing) {
    // The row was pruned between the failed insert and this read. Treat as a
    // fresh attempt rather than failing the request.
    return beginIdempotent(context);
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    await prisma.idempotencyRecord.deleteMany({
      where: { id: existing.id, expiresAt: { lte: new Date() } },
    });
    return beginIdempotent(context);
  }

  if (existing.requestHash !== context.requestHash) {
    return { state: 'mismatch' };
  }

  if (existing.completedAt && existing.statusCode !== null) {
    return {
      state: 'replayed',
      statusCode: existing.statusCode,
      body: existing.responseBody,
    };
  }

  // An uncompleted claim older than the lock window is treated as abandoned so
  // a crashed request cannot block the key forever.
  const staleLockMs = 2 * 60 * 1000;
  if (Date.now() - existing.lockedAt.getTime() > staleLockMs) {
    const reclaimed = await prisma.idempotencyRecord.updateMany({
      where: {
        id: existing.id,
        completedAt: null,
        lockedAt: existing.lockedAt,
        expiresAt: { gt: new Date() },
      },
      data: { lockedAt: new Date() },
    });
    if (reclaimed.count === 1) return { state: 'acquired', recordId: existing.id };
    // Another contender reclaimed or completed the row first. Re-read its
    // state so at most one caller can execute the protected command.
    return beginIdempotent(context);
  }

  return { state: 'in_progress' };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export async function completeIdempotent(
  recordId: string,
  statusCode: number,
  body: unknown,
  resourceId?: string,
  client: Pick<Prisma.TransactionClient, 'idempotencyRecord'> = getPrisma(),
): Promise<void> {
  await client.idempotencyRecord.update({
    where: { id: recordId },
    data: {
      statusCode,
      responseBody: body as Prisma.InputJsonValue,
      resourceId: resourceId ?? null,
      completedAt: new Date(),
    },
  });
}

/**
 * Release a claim after a failure that the client is allowed to retry. The row
 * is deleted so a corrected retry with the same key is not blocked by an
 * earlier permanent-looking failure.
 */
export async function abortIdempotent(recordId: string): Promise<void> {
  await getPrisma()
    .idempotencyRecord.delete({ where: { id: recordId } })
    .catch((error: unknown) => {
      log.warn({ err: error, recordId }, 'failed to release idempotency claim');
    });
}

/**
 * Run a command under idempotency.
 *
 * `execute` runs only when the key is newly claimed. Its return value is stored
 * and replayed for later retries. Throwing from `execute` releases the claim.
 */
export async function withIdempotency<T>(
  context: IdempotencyScope,
  execute: () => Promise<{ data: T; statusCode: number; resourceId?: string }>,
): Promise<{ data: T; statusCode: number; replayed: boolean }> {
  const outcome = await beginIdempotent(context);

  switch (outcome.state) {
    case 'mismatch':
      throw new ConflictError(
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        'This Idempotency-Key was already used for a different request. Use a new key.',
      );
    case 'in_progress':
      throw new ConflictError(
        ErrorCode.IDEMPOTENCY_IN_PROGRESS,
        'An identical request is already being processed. Please retry shortly.',
      );
    case 'replayed':
      return { data: outcome.body as T, statusCode: outcome.statusCode, replayed: true };
    case 'acquired':
      break;
  }

  try {
    const result = await execute();
    await completeIdempotent(outcome.recordId, result.statusCode, result.data, result.resourceId);
    return { data: result.data, statusCode: result.statusCode, replayed: false };
  } catch (error) {
    await abortIdempotent(outcome.recordId);
    throw error;
  }
}

/** Housekeeping: delete records whose idempotency window has closed. */
export async function pruneIdempotencyRecords(): Promise<number> {
  const result = await getPrisma().idempotencyRecord.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

export function idempotencyTtlMs(): number {
  void loadConfig();
  return DEFAULT_TTL_MS;
}
