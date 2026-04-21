import container from "./container";
import { Application } from "./app";

/**
 * service-a/src/server.ts — Application Entry Point
 *
 * This is the bootstrap file that wires everything together:
 * 1. Import the pre-configured DI container (all dependencies already registered)
 * 2. Extract the container's cradle (the resolved dependency map)
 * 3. Pass the cradle to the Application class (which sets up Express routes)
 * 4. Start listening for incoming HTTP requests
 *
 * WHY container.cradle:
 * The cradle is Awilix's Proxy that lazily resolves dependencies when accessed.
 * Passing it to Application means the app can access any registered dependency
 * (configProvider, logService, apiCallController) via this.cradle.
 */

const app = new Application(container.cradle);

app.start();
