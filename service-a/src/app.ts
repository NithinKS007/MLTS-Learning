import express, { Express } from "express";
import { ICradle } from "./container";
import { errorMiddleware } from "utils";

/**
 * service-a/src/app.ts — Express Application Setup
 *
 * Service A is the mTLS CLIENT. It receives plain HTTP requests from users
 * and forwards them to Service B over an mTLS-encrypted connection.
 *
 * FLOW:
 *   User (curl) → HTTP → Service A → mTLS → Service B → mTLS response → User
 *
 * NOTE: Service A itself listens on PLAIN HTTP (not HTTPS).
 * In production, you would put an HTTPS reverse proxy (Nginx, ALB) in front.
 * The mTLS only happens on the Service A → Service B internal call.
 */
export class Application {
  /** The Express application instance */
  private readonly app: Express;
  /** The Awilix cradle providing access to all injected dependencies */
  private readonly cradle: ICradle;

  constructor(cradle: ICradle) {
    this.app = express();
    this.cradle = cradle;

    // Order matters: routes must be registered before error handling
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Register application routes.
   *
   * GET /api/a → ApiCallController.handle
   * This is the single endpoint exposed to external callers.
   * The controller will internally make an mTLS call to Service B.
   */
  private setupRoutes(): void {
    this.app.get("/api/a", this.cradle.apiCallController.handle);
  }

  /**
   * Register the global error handling middleware.
   *
   * IMPORTANT: Error middleware MUST be registered AFTER all routes.
   * Express routes errors to the first 4-parameter middleware it finds.
   * If this is registered before routes, it will never be reached.
   */
  private setupErrorHandling(): void {
    this.app.use(errorMiddleware);
  }

  /**
   * Start listening for incoming HTTP requests.
   * The port is read from environment variables via ConfigProvider.
   */
  start(): void {
    const config = this.cradle.configProvider.loadConfig();
    this.app.listen(config.port, () => {
      this.cradle.logService.info(`Service A listening on port ${config.port}`);
    });
  }
}
