import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * utils/src/async.handler.ts — Async Controller Wrapper
 *
 * WHY THIS EXISTS:
 * Express does NOT automatically catch errors thrown inside async route handlers.
 * Without this wrapper, an unhandled promise rejection in a controller would
 * crash the process or hang the request — the error middleware would never fire.
 *
 * WHAT IT DOES:
 * Wraps an async controller function and attaches a `.catch(next)` to forward
 * any thrown error to Express's error middleware pipeline.
 *
 * HOW IT WORKS (without this wrapper):
 *   app.get('/api/b', async (req, res) => {
 *     throw new Error('boom'); // ❌ Express never catches this — request hangs
 *   });
 *
 * HOW IT WORKS (with this wrapper):
 *   app.get('/api/b', asyncHandler(async (req, res) => {
 *     throw new Error('boom'); // ✅ Caught by .catch(next) → errorMiddleware handles it
 *   }));
 *
 * WHY GENERICS:
 * The generic parameters <P, ResBody, ReqBody, ReqQuery> propagate the
 * Express Request/Response type parameters through to the controller.
 * This ensures type-safe access to req.params, req.body, and req.query
 * without needing 'any' or 'as' assertions.
 *
 * WHY NOT express-async-handler PACKAGE:
 * We previously used the `express-async-handler` npm package, but it
 * internally uses 'any' types. This native implementation achieves the
 * same result with zero dependencies and full type safety.
 */
export const asyncHandler = <P, ResBody, ReqBody, ReqQuery>(
  controllerMethod: (
    req: Request<P, ResBody, ReqBody, ReqQuery>,
    res: Response<ResBody>,
    next: NextFunction
  ) => Promise<void>
): RequestHandler<P, ResBody, ReqBody, ReqQuery> => {
  // Return a synchronous function that Express can register as a route handler.
  // Inside, we call the async controller and attach .catch(next) to forward errors.
  return (req, res, next) => {
    controllerMethod(req, res, next).catch(next);
  };
};
