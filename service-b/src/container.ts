import { createContainer, asClass, InjectionMode } from 'awilix';
import { ConfigProvider } from './config/config';
import { LogService } from 'utils';
import { ProcessService } from './services/process.service';
import { ProcessController } from './controllers/process.controller';

/**
 * service-b/src/container.ts — Awilix Dependency Injection Container
 *
 * Registers all Service B dependencies as singletons.
 * The cradle property names MUST match the destructured parameter names
 * in each class's constructor (Awilix resolves by name).
 *
 * DEPENDENCY GRAPH:
 *   ConfigProvider ← standalone (reads env vars)
 *   LogService     ← standalone (creates Pino logger)
 *   ProcessService ← depends on LogService (logs auth decisions)
 *   ProcessController ← depends on ProcessService (calls findProRequest)
 */

/** Type-safe cradle — defines every injectable dependency */
export interface ICradle {
  configProvider: ConfigProvider;
  logService: LogService;
  processService: ProcessService;
  processController: ProcessController;
}

const container = createContainer<ICradle>({
  injectionMode: InjectionMode.PROXY
});

container.register({
  configProvider: asClass(ConfigProvider).singleton(),
  logService: asClass(LogService).singleton(),
  processService: asClass(ProcessService).singleton(),
  processController: asClass(ProcessController).singleton()
});

export default container;
