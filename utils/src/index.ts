/**
 * utils/src/index.ts — Barrel Export File
 *
 * This is the public API of the `utils` shared package.
 * Every module in this package is re-exported from here so that
 * consumers (service-a, service-b) can import everything from
 * a single entry point: `import { CertLoader, LogService } from 'utils'`
 *
 * The order follows dependency hierarchy:
 *   1. Types and enums (no dependencies)
 *   2. Helpers (depend on types/enums)
 *   3. Middleware and utilities (depend on helpers)
 */

// --- Layer 1: Types & Constants (no internal dependencies) ---
export * from './types';
export * from './http.status.codes';

// --- Layer 2: Core Utilities ---
export * from './certLoader';     // Certificate file loading for mTLS
export * from './logService';     // Pino-based structured logging
export * from './socket.guard';   // Type guard for TLSSocket narrowing

// --- Layer 3: Express Helpers (depend on Layer 1) ---
export * from './async.handler';  // Async error wrapper for controllers
export * from './http.response';  // Standardized JSON response builder
export * from './error.helper';   // AppError class hierarchy
export * from './error.middleware'; // Global Express error handler
