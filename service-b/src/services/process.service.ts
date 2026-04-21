import { IServiceResponse, LogService } from "utils";

/**
 * service-b/src/services/process.service.ts — Identity Authorization Service
 *
 * THIS IS THE APPLICATION-LEVEL SECURITY GATE (Level 2 of the two-level trust model).
 *
 * By the time this service is called, the TLS layer has ALREADY verified:
 *   ✅ The caller has a valid certificate signed by our CA
 *
 * This service answers a DIFFERENT question:
 *   "Is this SPECIFIC valid identity AUTHORIZED to use this endpoint?"
 *
 * WHY BOTH LEVELS ARE NEEDED:
 * Imagine your CA signed certificates for 10 services. Without this check,
 * ANY of those 10 services could call Service B. The CN check creates an
 * access control list — only 'service-a' is allowed.
 *
 * IN PRODUCTION:
 * You would replace the hardcoded CN check with:
 *   - A configuration-driven allowlist (JSON/YAML config file)
 *   - A policy engine (Open Policy Agent / OPA)
 *   - RBAC rules from a database
 */

/** Interface for dependency injection — enables mock services in tests */
export interface IProcessService {
  findProRequest(callerCn?: string): IServiceResponse<null>;
}

export class ProcessService implements IProcessService {
  private readonly logService: LogService;

  constructor({ logService }: { logService: LogService }) {
    this.logService = logService;
  }

  /**
   * Authorize a request based on the caller's certificate Common Name (CN).
   *
   * @param callerCn - The CN extracted from the client certificate's subject field.
   *                   Undefined if no certificate was presented (shouldn't happen
   *                   with rejectUnauthorized: true, but we handle it defensively).
   *
   * @returns IServiceResponse<null> — success/failure with a descriptive message
   *
   * AUTHORIZATION LOGIC:
   *   1. No CN → anonymous → REJECT (defensive — TLS should have caught this)
   *   2. CN ≠ 'service-a' → wrong identity → REJECT
   *   3. CN === 'service-a' → authorized → ALLOW
   */
  findProRequest(callerCn?: string): IServiceResponse<null> {
    // Case 1: No CN available — this means no certificate was presented.
    // With rejectUnauthorized: true, Node.js should block this at the TLS layer.
    // This is a DEFENSE-IN-DEPTH check in case the server config is loosened.
    if (!callerCn) {
      this.logService.warn("Anonymous request rejected");
      return { success: false, message: "Client certificate required.", data: null };
    }

    // Case 2: Valid certificate, but from an unauthorized service.
    // Example: CN=logging-service has a valid cert, but isn't allowed here.
    if (callerCn !== "service-a") {
      this.logService.warn(`Unauthorized access attempt from ${callerCn}`);
      return { success: false, message: "Identity untrusted.", data: null };
    }

    // Case 3: Authorized — CN matches the allowlist.
    this.logService.info(`Securely processed request for ${callerCn}`);
    return {
      success: true,
      message: "Service B processed the data securely.",
      data: null,
    };
  }
}
