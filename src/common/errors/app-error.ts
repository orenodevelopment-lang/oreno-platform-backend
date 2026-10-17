import { ErrorCode } from './error-codes.js';

export interface AppErrorOptions {
  /** Safe, user-presentable message. Never include internal detail. */
  message?: string;
  /** Structured, non-sensitive detail for logs and debugging. */
  details?: Record<string, unknown>;
  /** Underlying cause, kept server-side only. */
  cause?: unknown;
  /** Field-level validation failures keyed by request path. */
  fieldErrors?: Record<string, string[]>;
}

/**
 * Base class for every expected application failure.
 *
 * Anything thrown that is not an `AppError` is treated as an unexpected defect:
 * the API returns `INTERNAL_ERROR` and the real error is logged, never returned.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details: Record<string, unknown> | undefined;
  public readonly fieldErrors: Record<string, string[]> | undefined;
  /** Marks errors that are safe to show to the caller. */
  public readonly expose: boolean;

  constructor(code: ErrorCode, status: number, options: AppErrorOptions = {}, expose = true) {
    super(options.message ?? code, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = options.details;
    this.fieldErrors = options.fieldErrors;
    this.expose = expose;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** 400 — the request was understood but is invalid. */
export class ValidationError extends AppError {
  constructor(message = 'The request could not be validated.', options: AppErrorOptions = {}) {
    super(ErrorCode.VALIDATION_FAILED, 400, { ...options, message });
  }
}

/** 401 — no valid authentication was presented. */
export class UnauthenticatedError extends AppError {
  constructor(
    code: ErrorCode = ErrorCode.UNAUTHENTICATED,
    message = 'Authentication is required.',
    options: AppErrorOptions = {},
  ) {
    super(code, 401, { ...options, message });
  }
}

/** 403 — authenticated, but not permitted. */
export class ForbiddenError extends AppError {
  constructor(
    code: ErrorCode = ErrorCode.FORBIDDEN,
    message = 'You do not have permission to perform this action.',
    options: AppErrorOptions = {},
  ) {
    super(code, 403, { ...options, message });
  }
}

/** 404 — the resource does not exist or is not visible to this actor. */
export class NotFoundError extends AppError {
  constructor(
    code: ErrorCode = ErrorCode.NOT_FOUND,
    message = 'The requested resource was not found.',
    options: AppErrorOptions = {},
  ) {
    super(code, 404, { ...options, message });
  }
}

/** 409 — the request conflicts with current state. */
export class ConflictError extends AppError {
  constructor(
    code: ErrorCode = ErrorCode.CONFLICT,
    message = 'The request conflicts with the current state of the resource.',
    options: AppErrorOptions = {},
  ) {
    super(code, 409, { ...options, message });
  }
}

/** 410 — the resource existed but is permanently gone (e.g. expired export). */
export class GoneError extends AppError {
  constructor(
    code: ErrorCode = ErrorCode.NOT_FOUND,
    message = 'The requested resource is no longer available.',
    options: AppErrorOptions = {},
  ) {
    super(code, 410, { ...options, message });
  }
}

/** 413 — the payload exceeds the configured limit. */
export class PayloadTooLargeError extends AppError {
  constructor(message = 'The request payload is too large.', options: AppErrorOptions = {}) {
    super(ErrorCode.PAYLOAD_TOO_LARGE, 413, { ...options, message });
  }
}

/** 415 — the media type is not supported. */
export class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'The request media type is not supported.', options: AppErrorOptions = {}) {
    super(ErrorCode.UNSUPPORTED_MEDIA_TYPE, 415, { ...options, message });
  }
}

/** 422 — well-formed but semantically unprocessable (e.g. invalid state change). */
export class UnprocessableError extends AppError {
  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(code, 422, { ...options, message });
  }
}

/** 429 — the caller exceeded a rate limit. */
export class RateLimitError extends AppError {
  constructor(
    message = 'Too many requests. Please try again later.',
    options: AppErrorOptions = {},
  ) {
    super(ErrorCode.RATE_LIMIT_EXCEEDED, 429, { ...options, message });
  }
}

/** 501 — a deliberately deferred integration was invoked. */
export class NotImplementedError extends AppError {
  constructor(message = 'This capability is not implemented.', options: AppErrorOptions = {}) {
    super(ErrorCode.NOT_IMPLEMENTED, 501, { ...options, message });
  }
}

/** 503 — a required dependency is unavailable. */
export class DependencyUnavailableError extends AppError {
  constructor(
    message = 'A required dependency is temporarily unavailable.',
    options: AppErrorOptions = {},
  ) {
    super(ErrorCode.DEPENDENCY_UNAVAILABLE, 503, { ...options, message }, false);
  }
}

/** 500 — an unexpected defect. Detail is logged, never returned. */
export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred.', options: AppErrorOptions = {}) {
    super(ErrorCode.INTERNAL_ERROR, 500, { ...options, message }, false);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
