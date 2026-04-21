/**
 * utils/src/http.status.codes.ts — HTTP Status Code Enum
 *
 * Using an enum instead of raw numbers prevents typos (e.g., 2000 instead of 200)
 * and makes the codebase searchable — you can find every "Forbidden" response
 * by searching for StatusCodes.Forbidden.
 */
export enum StatusCodes {
  /** Request succeeded */
  OK = 200,
  /** Resource created successfully */
  Created = 201,
  /** Request accepted for async processing */
  Accepted = 202,
  /** Client sent invalid data */
  BadRequest = 400,
  /** Authentication required (who are you?) */
  Unauthorized = 401,
  /** Authenticated but not authorized (you can't do this) */
  Forbidden = 403,
  /** Resource does not exist */
  NotFound = 404,
  /** Resource state conflict (e.g., duplicate entry) */
  Conflict = 409,
  /** Too many requests — rate limited */
  RateLimit = 429,
  /** Unhandled server error */
  InternalServerError = 500,
  /** Downstream service is unavailable */
  ServiceUnavailable = 503,
  /** Downstream service timed out */
  GatewayTimeout = 504,
}
