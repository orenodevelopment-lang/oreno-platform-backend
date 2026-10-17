import type { Response } from 'express';
import type { ErrorCode } from '../errors/error-codes.js';
import { getRequestId } from '../logging/context.js';

/**
 * Every successful response uses one of exactly two shapes:
 *
 *   { "data": {...}, "meta": {...} }
 *   { "data": [...], "meta": { "page": 1, "pageSize": 20, "total": 0, "pageCount": 0 } }
 */
export interface SuccessEnvelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

export interface ErrorEnvelope {
  error: {
    /** A code from the `ErrorCode` catalogue; every failure maps to one. */
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
    fieldErrors?: Record<string, string[]>;
  };
}

export function success<T>(data: T, meta: Record<string, unknown> = {}): SuccessEnvelope<T> {
  return { data, meta };
}

export function errorEnvelope(
  code: ErrorCode,
  message: string,
  options: {
    requestId?: string;
    details?: Record<string, unknown>;
    fieldErrors?: Record<string, string[]>;
  } = {},
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      requestId: options.requestId ?? getRequestId() ?? 'unknown',
      ...(options.details ? { details: options.details } : {}),
      ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
    },
  };
}

/** Send a 200 response with the standard envelope. */
export function sendSuccess<T>(
  res: Response,
  data: T,
  options: { status?: number; meta?: Record<string, unknown> } = {},
): void {
  res.status(options.status ?? 200).json(success(data, options.meta ?? {}));
}

/** Send a 201 response with the standard envelope and optional Location header. */
export function sendCreated<T>(
  res: Response,
  data: T,
  options: { location?: string; meta?: Record<string, unknown> } = {},
): void {
  if (options.location) res.setHeader('Location', options.location);
  res.status(201).json(success(data, options.meta ?? {}));
}

/** Send a 204 with no body (used for deletes and idempotent no-ops). */
export function sendNoContent(res: Response): void {
  res.status(204).end();
}
