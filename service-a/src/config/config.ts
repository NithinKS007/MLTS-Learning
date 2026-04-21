import dotenv from "dotenv";
import path from "path";

/**
 * service-a/src/config/config.ts — Environment Configuration
 *
 * Centralizes all environment variable access into a single typed object.
 * This prevents scattered process.env calls throughout the codebase and
 * provides sensible defaults for local development.
 */

/** Strongly-typed configuration shape */
export interface IAppConfig {
  /** Port for the HTTP server (default: 3001) */
  port: number;
  /** Path to the directory containing mTLS certificate files */
  certsDir: string;
  /** Full URL of Service B's endpoint that Service A calls via mTLS */
  serviceBUrl: string;
}

export class ConfigProvider {
  /** Immutable configuration loaded once at construction time */
  private readonly config: IAppConfig;

  constructor() {
    // Load .env file if present (for local development)
    dotenv.config();

    this.config = {
      port: parseInt(process.env.SERVICE_A_PORT || "3001", 10),
      certsDir: process.env.CERTS_DIR || path.join(__dirname, "../../../certs"),
      // Service A calls Service B over HTTPS (mTLS) — note the https:// scheme
      serviceBUrl: process.env.SERVICE_B_URL || "https://localhost:3002/api/b",
    };
  }

  /** Returns the frozen configuration object */
  loadConfig(): IAppConfig {
    return this.config;
  }
}
