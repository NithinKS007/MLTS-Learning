/**
 * utils/src/types.ts — Shared Type Definitions
 *
 * These interfaces define the contracts used across the entire mTLS ecosystem.
 * By centralizing them in the shared `utils` package, both services use
 * identical data shapes — preventing drift and enabling compile-time validation.
 */

/**
 * IServiceResponse<T> — Standardized API Response Envelope
 *
 * Every API endpoint in this project returns data wrapped in this structure.
 * The generic parameter T defines the shape of the `data` payload, giving
 * consumers compile-time safety over what they receive.
 *
 * Example: IServiceResponse<null>   → data is null (no payload)
 *          IServiceResponse<{name}> → data has a `name` field
 */
export interface IServiceResponse<T> {
  /** Whether the operation succeeded (derived from HTTP status in sendResponse) */
  success: boolean;
  /** Human-readable description of the result */
  message: string;
  /** The actual response payload — typed via generic T */
  data: T;
}
