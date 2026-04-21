import { StatusCodes } from "./http.status.codes";

/**
 * utils/src/error.helper.ts — Application Error Class Hierarchy
 *
 * WHY THIS EXISTS:
 * Standard JavaScript `Error` objects don't carry an HTTP status code.
 * By extending Error with `AppError`, we can throw domain-specific errors
 * from services/controllers and have the errorMiddleware automatically
 * map them to the correct HTTP response.
 *
 * USAGE:
 *   throw new ForbiddenError('Client certificate CN not allowed');
 *   → errorMiddleware catches it → sends 403 response with the message
 *
 * WHY A CLASS HIERARCHY:
 * Instead of `throw new AppError('msg', 403)` everywhere, named subclasses
 * like `ForbiddenError` make the code self-documenting and searchable.
 * You can grep for `ForbiddenError` to find all 403 scenarios.
 */

/** Base error class — all application errors extend this */
export class AppError extends Error {
  /** HTTP status code to return when this error reaches the middleware */
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message); // Set Error.message
    this.statusCode = statusCode;
  }
}

/** 400 Bad Request — client sent malformed or invalid data */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, StatusCodes.BadRequest);
  }
}

/** 404 Not Found — the requested resource does not exist */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, StatusCodes.NotFound);
  }
}

/** 401 Unauthorized — authentication is required but missing or invalid */
export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, StatusCodes.Unauthorized);
  }
}

/**
 * 403 Forbidden — authenticated but not authorized for this action
 *
 * In mTLS context: The certificate is valid (signed by our CA),
 * but the CN is not in the allowlist for this endpoint.
 */
export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, StatusCodes.Forbidden);
  }
}

/** 409 Conflict — operation conflicts with existing state (e.g., duplicate) */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, StatusCodes.Conflict);
  }
}

/** 500 Internal Server Error — unexpected failure in a database or service layer */
export class DatabaseError extends AppError {
  constructor(message: string) {
    super(message, StatusCodes.InternalServerError);
  }
}
