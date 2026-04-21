import { Request, Response } from "express";
import { ApiCallService } from "../services/api.call.service";
import { ConfigProvider } from "../config/config";
import { asyncHandler, sendResponse, StatusCodes } from "utils";

/**
 * service-a/src/controllers/api.call.controller.ts — HTTP Request Handler
 *
 * This controller handles GET /api/a requests from external users.
 * It orchestrates the mTLS call to Service B and returns the combined result.
 *
 * FLOW:
 *   1. User calls GET /api/a (plain HTTP)
 *   2. This controller asks ApiCallService to fetch data from Service B
 *   3. ApiCallService makes the mTLS-authenticated HTTPS request
 *   4. The response from Service B is wrapped and returned to the user
 */
export class ApiCallController {
  /** Service responsible for making mTLS calls to downstream services */
  private readonly apiCallService: ApiCallService;
  /** Provides configuration (Service B URL, cert paths, etc.) */
  private readonly configProvider: ConfigProvider;

  /**
   * Awilix injects dependencies via the destructured cradle proxy.
   * The property names must match exactly what's registered in container.ts.
   */
  constructor({
    apiCallService,
    configProvider,
  }: {
    apiCallService: ApiCallService;
    configProvider: ConfigProvider;
  }) {
    this.apiCallService = apiCallService;
    this.configProvider = configProvider;
  }

  /**
   * Handle GET /api/a
   *
   * Wrapped in asyncHandler so that any thrown error (e.g., network failure
   * when calling Service B) is automatically forwarded to errorMiddleware.
   *
   * The generic parameter on fetchData<T> tells TypeScript what shape
   * we expect Service B's response to have — enabling compile-time checks.
   */
  handle = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const config = this.configProvider.loadConfig();

    // Make the mTLS call to Service B
    // The generic tells TypeScript: "I expect Service B to return { message, service }"
    const dataFromB = await this.apiCallService.fetchData<{
      message: string;
      service: string;
    }>(config.serviceBUrl);

    // Compose the response — includes Service A's own metadata + data from Service B
    const data = {
      service: "service-a",
      message: "Service A successfully called Service B",
      dataFromB,
    };

    const message = "Data fetched successfully from Service B";

    sendResponse(res, StatusCodes.OK, data, message);
  });
}
