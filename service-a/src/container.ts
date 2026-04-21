import { createContainer, asClass, InjectionMode } from "awilix";
import { ConfigProvider } from "./config/config";
import { LogService } from "utils";
import { ApiCallController } from "./controllers/api.call.controller";
import { ApiCallService } from "./services/api.call.service";

/**
 * service-a/src/container.ts — Awilix Dependency Injection Container
 *
 * WHY DEPENDENCY INJECTION:
 * Instead of each class creating its own dependencies (tight coupling),
 * Awilix creates all instances and injects them via constructor arguments.
 * This makes testing easy (swap real services with mocks) and ensures
 * a single instance (singleton) of shared resources like the logger.
 *
 * HOW AWILIX PROXY MODE WORKS:
 * With InjectionMode.PROXY, Awilix passes a Proxy object to each constructor.
 * When the constructor destructures it ({ configProvider }), Awilix resolves
 * that dependency from the container at that moment. This means dependencies
 * don't need to be registered in any specific order.
 *
 * WHY SINGLETON:
 * Each service is registered as a singleton because:
 *   - ConfigProvider: reads env vars once at startup
 *   - LogService: maintains a single Pino logger instance
 *   - ApiCallService: caches the https.Agent for connection reuse
 *   - ApiCallController: stateless — one instance is sufficient
 */

/** Type-safe cradle interface — defines all available dependencies */
export interface ICradle {
  configProvider: ConfigProvider;
  logService: LogService;
  apiCallController: ApiCallController;
  apiCallService: ApiCallService;
}

/** Create the container with PROXY injection mode */
const container = createContainer<ICradle>({
  injectionMode: InjectionMode.PROXY,
});

/** Register all dependencies as singletons */
container.register({
  configProvider: asClass(ConfigProvider).singleton(),
  logService: asClass(LogService).singleton(),
  apiCallService: asClass(ApiCallService).singleton(),
  apiCallController: asClass(ApiCallController).singleton(),
});

export default container;
