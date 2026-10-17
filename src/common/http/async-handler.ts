import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wrap a route handler so a failure reaches the error middleware.
 *
 * Express 4 does not await handlers: a rejection inside an `async` function
 * becomes an unhandled rejection and the request hangs until it times out.
 * Express 5 does forward rejections, but wrapping every handler here keeps the
 * behaviour identical across both and also catches a synchronous throw from a
 * handler that is not `async`.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
): RequestHandler {
  return (req, res, next) => {
    // `Promise.resolve().then(...)` converts a synchronous throw into a
    // rejection, so both failure modes take the same path to `next`.
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}
