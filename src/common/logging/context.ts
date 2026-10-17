import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  requestId: string;
  correlationId: string;
  userId?: string;
  organisationId?: string;
  module?: string;
  ip?: string;
  userAgent?: string;
  /** Set when a platform administrator acts on behalf of another user. */
  impersonatedByUserId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Merge additional fields into the active context (no-op outside a request). */
export function enrichContext(partial: Partial<RequestContext>): void {
  const current = storage.getStore();
  if (!current) return;
  Object.assign(current, partial);
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

export function newRequestId(): string {
  return randomUUID();
}

/**
 * Read an inbound correlation ID from headers, falling back to a fresh one.
 * The value is length-capped and character-filtered so a hostile client cannot
 * inject control characters into logs.
 */
export function resolveCorrelationId(headers: Record<string, unknown>): string {
  const raw = headers['x-correlation-id'] ?? headers['x-request-id'];
  // A repeated header arrives as an array; the first value is the one to use.
  const value = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
  if (typeof value === 'string') {
    const sanitised = value.replace(/[^\w.:-]/g, '').slice(0, 128);
    if (sanitised.length > 0) return sanitised;
  }
  return randomUUID();
}
