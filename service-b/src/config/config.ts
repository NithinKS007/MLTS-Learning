import dotenv from "dotenv";
import path from "path";

/**
 * service-b/src/config/config.ts — Environment Configuration
 *
 * Same pattern as Service A's config — centralized, typed, immutable.
 * Service B only needs port and certsDir (no downstream URL since
 * Service B is the server — it doesn't initiate outbound mTLS calls).
 */

/** Strongly-typed configuration shape for Service B */
export interface IAppConfig {
  /** Port for the HTTPS server (default: 3002) */
  port: number;
  /** Path to the directory containing mTLS certificate files */
  certsDir: string;
}

export class ConfigProvider {
  private readonly config: IAppConfig;

  constructor() {
    dotenv.config();
    this.config = {
      port: parseInt(process.env.SERVICE_B_PORT || "3002", 10),
      certsDir: process.env.CERTS_DIR || path.join(__dirname, "../../../certs"),
    };
  }

  loadConfig(): IAppConfig {
    return this.config;
  }
}
