import container from "./container";
import { Application } from "./app";

/**
 * service-b/src/server.ts — Application Entry Point
 *
 * Bootstraps Service B — the mTLS SERVER.
 * Unlike Service A (which listens on plain HTTP), Service B creates
 * an HTTPS server that REQUIRES client certificates (mutual TLS).
 *
 * 1. The DI container resolves all dependencies (config, logger, controller)
 * 2. The Application class sets up Express routes and the HTTPS server
 * 3. start() begins listening on the configured port with mTLS enforcement
 */

const app = new Application(container.cradle);

app.start();
