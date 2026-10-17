import type { NextFunction, Request, Response } from 'express';
import { newRequestId, resolveCorrelationId, runWithContext } from '../logging/context.js';
import type { AuthContext } from '../../modules/auth/auth.types.js';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    correlationId: string;
    /** Populated by the authentication middleware once a session is resolved. */
    auth?: AuthContext;
  }
}

/**
 * Establish a request context for every inbound request.
 *
 * The context is stored in AsyncLocalStorage so any logger call or error
 * thrown deeper in the stack automatically carries the request and correlation
 * IDs without threading them through every function signature.
 */
export function requestContextMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = newRequestId();
    const correlationId = resolveCorrelationId(req.headers);

    req.requestId = requestId;
    req.correlationId = correlationId;

    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Correlation-Id', correlationId);

    runWithContext(
      {
        requestId,
        correlationId,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      },
      () => {
        next();
      },
    );
  };
}
