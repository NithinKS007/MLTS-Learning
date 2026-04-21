import { Request, Response, NextFunction } from "express";
import { sendResponse } from "./http.response";
import { StatusCodes } from "./http.status.codes";
import { AppError } from "./error.helper";

/**
 * utils/src/error.middleware.ts — Global Express Error Handler
 *
 * WHY THIS EXISTS:
 * Express identifies error-handling middleware by its 4-parameter signature:
 *   (err, req, res, next)
 * When asyncHandler catches a thrown error and calls next(error), Express
 * skips all normal middleware and jumps directly to this handler.
 *
 * WHAT IT DOES:
 * 1. Logs the error for debugging/observability
 * 2. Extracts the statusCode from AppError (or defaults to 500)
 * 3. Sends a standardized JSON response via sendResponse
 *
 * WHY AppError TYPE FOR err:
 * Express middleware technically receives `any` for the err parameter, but
 * in this project, all errors are thrown as AppError subclasses.
 * The `err.statusCode || 500` fallback handles unexpected non-AppError errors.
 *
 * IMPORTANT: This middleware must be registered LAST in the Express pipeline
 * (after all routes) — otherwise Express won't route errors to it.
 */
export const errorMiddleware = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  // Log the full error for server-side debugging
  console.error("Error occurred:", err);

  // Use the error's statusCode if it's an AppError, otherwise 500
  const statusCode = err.statusCode || StatusCodes.InternalServerError;
  const message = err.message || "INTERNAL SERVER ERROR";

  // Send standardized error response to the client
  sendResponse(res, statusCode, null, message);
};
