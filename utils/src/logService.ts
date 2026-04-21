import pino from "pino";

/**
 * utils/src/logService.ts — Centralized Structured Logger
 *
 * Uses Pino for high-performance structured JSON logging.
 * Injected via Awilix as a singleton into every service.
 *
 * WHY structured logging?
 * In production with multiple microservices, plain text logs are unsearchable.
 * Structured JSON logs can be ingested by ELK Stack, Datadog, or CloudWatch
 * and queried by fields (e.g., "show all WARN logs from service-b").
 *
 * WHY Pino?
 * Pino is the fastest Node.js logger (~5x faster than Winston) because
 * it uses worker threads for serialization, avoiding blocking the event loop.
 */

/** Interface for dependency injection — allows mock loggers in tests */
export interface ILogService {
  info(message: string, context?: object): void;
  warn(message: string, context?: object): void;
  error(message: string, error: Error, context?: object): void;
}

export class LogService implements ILogService {
  /**
   * Pino logger instance configured with pretty-printing for development.
   * In production, you would remove the `transport` option and let Pino
   * output raw JSON, which is then parsed by your log aggregation pipeline.
   */
  private readonly logger = pino({
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  });

  /** Log informational messages (e.g., "Service started", "Request processed") */
  info(message: string, context?: object): void {
    this.logger.info({ ...context }, message);
  }

  /**
   * Log warning messages (e.g., "Unknown caller CN", "Rate limit approaching")
   * Warnings indicate something unexpected but not fatal.
   */
  warn(message: string, context?: object): void {
    this.logger.warn({ ...context }, message);
  }

  /**
   * Log error messages with the Error object attached.
   * The error message is extracted and logged as a field for searchability.
   */
  error(message: string, error: Error, context?: object): void {
    this.logger.error({ ...context, err: error.message }, message);
  }
}
