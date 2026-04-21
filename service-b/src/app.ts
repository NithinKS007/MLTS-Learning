import express, { Express } from "express";
import https from "https";
import { ICradle } from "./container";
import { CertLoader, errorMiddleware } from "utils";

/**
 * service-b/src/app.ts — HTTPS Application with mTLS Enforcement
 *
 * THIS IS WHERE THE mTLS MAGIC HAPPENS ON THE SERVER SIDE.
 *
 * Unlike Service A (plain HTTP), Service B creates an HTTPS server that:
 *   1. Presents its own certificate to prove its identity to callers
 *   2. DEMANDS a client certificate from every caller (requestCert: true)
 *   3. REJECTS connections if the client cert is invalid (rejectUnauthorized: true)
 *
 * After the TLS handshake succeeds, the ProcessController performs an
 * additional application-level check on the client's CN (Common Name).
 *
 * TWO-LEVEL SECURITY MODEL:
 *   Level 1 (Transport): "Is this certificate signed by our CA?" → Node.js handles this
 *   Level 2 (Application): "Is this CN allowed to call this endpoint?" → Our code handles this
 */
export class Application {
  private readonly app: Express;
  private readonly cradle: ICradle;

  constructor(cradle: ICradle) {
    this.app = express();
    this.cradle = cradle;
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Register application routes.
   * GET /api/b → ProcessController.handle
   * This endpoint is ONLY accessible via mTLS (HTTPS with client cert).
   */
  private setupRoutes(): void {
    this.app.get("/api/b", this.cradle.processController.handle);
  }

  /**
   * Register error middleware — must be AFTER routes.
   * See utils/src/error.middleware.ts for details.
   */
  private setupErrorHandling(): void {
    this.app.use(errorMiddleware);
  }

  /**
   * Create and start the HTTPS server with mTLS configuration.
   *
   * WHY https.createServer INSTEAD OF app.listen:
   * Express's app.listen() creates a plain HTTP server.
   * For mTLS, we need the Node.js https module to configure TLS options.
   *
   * THE mTLS SERVER OPTIONS EXPLAINED:
   *
   *   ca:   Buffer → Root CA certificate
   *         Used to verify CLIENT certificates.
   *         "Is the client's cert signed by a CA I trust?"
   *
   *   cert: Buffer → Service B's own certificate
   *         Sent to the client during the TLS handshake.
   *         "Here's my identity — I am service-b."
   *
   *   key:  Buffer → Service B's private key
   *         Used to prove ownership of the certificate.
   *         "I can cryptographically prove I own service-b.crt."
   *
   *   requestCert: true
   *         THIS IS WHAT MAKES IT mTLS (not just TLS).
   *         During the handshake, the server sends a CertificateRequest
   *         message to the client, demanding their certificate.
   *         Without this, it would be standard one-way TLS.
   *
   *   rejectUnauthorized: true
   *         ENFORCEMENT POLICY.
   *         If the client's certificate fails verification:
   *           - Not signed by our CA? → Connection dropped.
   *           - Expired? → Connection dropped.
   *           - No cert provided? → Connection dropped.
   *         The client never reaches Express routes.
   */
  start(): void {
    const config = this.cradle.configProvider.loadConfig();
    const loader = new CertLoader(config.certsDir);

    try {
      // Load the trust anchor — used to verify incoming client certificates
      const ca = loader.findCA();

      // Load Service B's own identity + proof of ownership
      const { cert, key } = loader.findCertPair("service-b");

      // Create the HTTPS server with full mTLS enforcement
      const server = https.createServer(
        {
          ca, // Trust anchor: verify client certs against this CA
          cert, // Server identity: presented to clients
          key, // Server proof: proves ownership of the cert
          requestCert: true, // ← THE mTLS FLAG: "send me your certificate"
          rejectUnauthorized: true, // ← ENFORCEMENT: reject invalid/missing client certs
        },
        this.app,
      );

      server.listen(config.port, () => {
        this.cradle.logService.info(
          `Service B (mTLS) listening on port ${config.port}`,
        );
      });
    } catch (error: unknown) {
      // Type-safe error handling without 'as' assertions
      if (error instanceof Error) {
        this.cradle.logService.error("Failed to start Service B", error);
      } else {
        this.cradle.logService.error(
          "Failed to start Service B",
          new Error(String(error)),
        );
      }
      process.exit(1);
    }
  }
}
