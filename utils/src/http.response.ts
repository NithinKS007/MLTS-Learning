import { Response } from "express";

/**
 * utils/src/http.response.ts — Standardized API Response Builder
 *
 * WHY THIS EXISTS:
 * Without this helper, each controller would manually construct its own
 * response shape — leading to inconsistency (some return { data }, others
 * return { result }, etc.). Standardization means:
 *   1. Frontend/consumers always know the exact response structure
 *   2. Error responses and success responses share the same envelope
 *   3. The `success` field is auto-derived from the status code
 *
 * RESPONSE STRUCTURE:
 *   {
 *     "success": true,       ← Derived: statusCode >= 200 && < 300
 *     "status": 200,         ← HTTP status code (also in the HTTP header)
 *     "message": "...",      ← Human-readable description
 *     "data": { ... }        ← The actual payload (generic type T)
 *   }
 *
 * WHY GENERIC <T>:
 * The generic parameter ensures that the `data` field's type is validated
 * at compile time. If a controller declares `sendResponse<string>(...)`,
 * TypeScript will error if you pass an object instead of a string.
 */
export const sendResponse = <T>(
    res: Response,
    statusCode: number,
    data: T | null = null,
    message: string,
) => {
    // Derive success from status code range — 2xx = success, everything else = failure
    const success = statusCode >= 200 && statusCode < 300;

    return res.status(statusCode).json({
        success,
        status: statusCode,
        message,
        data,
    });
};
