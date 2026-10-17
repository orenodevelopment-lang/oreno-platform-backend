import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import {
  AppError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  isAppError,
} from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import { errorEnvelope } from '../http/response.js';
import { createModuleLogger, serialiseError } from '../logging/logger.js';
import { getContext } from '../logging/context.js';
import { reportError } from '../observability/error-monitor.js';

const log = createModuleLogger('error');

/** Translate a Prisma error into a safe application error. */
function fromPrismaError(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    case 'P2002': {
      const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
      return new AppError(ErrorCode.CONFLICT, 409, {
        message: 'A record with these values already exists.',
        details: target.length > 0 ? { fields: target } : undefined,
        cause: error,
      });
    }
    case 'P2003':
      return new AppError(ErrorCode.CONFLICT, 409, {
        message: 'The operation references a record that does not exist.',
        cause: error,
      });
    case 'P2025':
      return new AppError(ErrorCode.NOT_FOUND, 404, {
        message: 'The requested resource was not found.',
        cause: error,
      });
    case 'P2034':
      // Transaction conflict from serializable isolation; the caller may retry.
      return new AppError(ErrorCode.CONFLICT, 409, {
        message: 'The request conflicted with a concurrent change. Please retry.',
        cause: error,
      });
    default:
      return new AppError(
        ErrorCode.INTERNAL_ERROR,
        500,
        { message: 'An unexpected error occurred.', cause: error },
        false,
      );
  }
}

function fromZodError(error: ZodError): AppError {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_root';
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return new AppError(ErrorCode.VALIDATION_FAILED, 400, {
    message: 'The request could not be validated.',
    fieldErrors,
    cause: error,
  });
}

function normalise(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (error instanceof ZodError) return fromZodError(error);

  if (error instanceof Prisma.PrismaClientKnownRequestError) return fromPrismaError(error);

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppError(
      ErrorCode.INTERNAL_ERROR,
      500,
      { message: 'An unexpected error occurred.', cause: error },
      false,
    );
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new AppError(
      ErrorCode.DEPENDENCY_UNAVAILABLE,
      503,
      { message: 'A required dependency is temporarily unavailable.', cause: error },
      false,
    );
  }

  // A body-parser JSON syntax error surfaces as a SyntaxError with `body` set.
  if (error instanceof SyntaxError && 'body' in error) {
    return new AppError(ErrorCode.MALFORMED_JSON, 400, {
      message: 'The request body is not valid JSON.',
      cause: error,
    });
  }

  // body-parser tags its other failures with a `type`; without this they would
  // be reported as unexpected 500s instead of the 4xx the caller caused.
  const bodyParserType = (error as { type?: unknown }).type;
  if (typeof bodyParserType === 'string') {
    if (bodyParserType === 'entity.too.large') {
      return new PayloadTooLargeError('The request payload is too large.', { cause: error });
    }
    if (bodyParserType === 'encoding.unsupported' || bodyParserType === 'charset.unsupported') {
      return new UnsupportedMediaTypeError('The request encoding is not supported.', {
        cause: error,
      });
    }
  }

  return new AppError(
    ErrorCode.INTERNAL_ERROR,
    500,
    { message: 'An unexpected error occurred.', cause: error },
    false,
  );
}

/**
 * Terminal error handler.
 *
 * Expected failures return their declared code and safe message. Unexpected
 * failures are logged in full and reported as a generic `INTERNAL_ERROR`, so
 * internal detail (stack traces, SQL, connection strings) never reaches the
 * client.
 */
export function errorHandlerMiddleware() {
  return (error: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const appError = normalise(error);
    const context = getContext();
    const requestId = req.requestId ?? context?.requestId ?? 'unknown';

    const logPayload = {
      code: appError.code,
      status: appError.status,
      method: req.method,
      path: req.path,
      ...(appError.details ? { details: appError.details } : {}),
      err: serialiseError(appError.cause ?? appError),
    };

    if (appError.status >= 500) {
      log.error(logPayload, 'unhandled request error');
      reportError(appError, { requestId, route: req.path, method: req.method });
    } else if (appError.status === 401 || appError.status === 403) {
      log.warn(logPayload, 'authorisation failure');
    } else {
      log.info(logPayload, 'request error');
    }

    const body = errorEnvelope(appError.code, appError.message, {
      requestId,
      ...(appError.fieldErrors ? { fieldErrors: appError.fieldErrors } : {}),
      ...(appError.details && appError.expose ? { details: appError.details } : {}),
    });

    res.status(appError.status).json(body);
  };
}

/** 404 handler for unmatched routes; placed after all routers. */
export function notFoundMiddleware() {
  return (req: Request, res: Response): void => {
    res.status(404).json(
      errorEnvelope(ErrorCode.ROUTE_NOT_FOUND, 'The requested endpoint does not exist.', {
        requestId: req.requestId,
      }),
    );
  };
}
