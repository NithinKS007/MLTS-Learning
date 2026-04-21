import { Request, Response } from "express";
import { IProcessService } from "../services/process.service";
import { asyncHandler, sendResponse, StatusCodes, isTLSSocket } from "utils";

/**
 * service-b/src/controllers/process.controller.ts — mTLS Request Handler
 *
 * This controller handles requests that arrive AFTER a successful mTLS handshake.
 * By the time code reaches here, Node.js has ALREADY verified:
 *   ✅ The client presented a certificate
 *   ✅ The certificate is signed by our trusted CA
 *   ✅ The certificate is not expired
 *   ✅ The client proved ownership of the certificate (CertificateVerify)
 *
 * THIS CONTROLLER ADDS APPLICATION-LEVEL AUTHORIZATION:
 *   "The cert is valid, but is THIS SPECIFIC identity allowed to call this endpoint?"
 *
 * This is the TWO-LEVEL TRUST MODEL:
 *   Level 1 (Transport): Handled by Node.js → "Is the cert valid?"
 *   Level 2 (Application): Handled HERE → "Is CN=service-a allowed?"
 */
export class ProcessController {
  private readonly processService: IProcessService;

  constructor({ processService }: { processService: IProcessService }) {
    this.processService = processService;
  }

  /**
   * Handle GET /api/b
   *
   * STEP-BY-STEP:
   * 1. Verify the socket is a TLSSocket (type guard — no 'as' assertion)
   * 2. Extract the peer certificate from the TLS session
   * 3. Read the Common Name (CN) from the certificate's subject
   * 4. Pass the CN to ProcessService for authorization
   * 5. Return the result
   */
  handle = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // TYPE GUARD: Verify the connection is actually TLS.
    // In normal operation, this always passes because Service B only listens on HTTPS.
    // This guard prevents a runtime crash if somehow a non-TLS request arrives.
    if (!isTLSSocket(req.socket)) {
      sendResponse(res, StatusCodes.Forbidden, null, "Secure connection required.");
      return;
    }

    // EXTRACT PEER CERTIFICATE:
    // After the type guard, TypeScript knows req.socket is TLSSocket,
    // so getPeerCertificate() is available without type assertions.
    //
    // getPeerCertificate() returns the CLIENT's certificate — the one
    // Service A presented during the mTLS handshake (Step 5 of the flow).
    const clientCert = req.socket.getPeerCertificate();

    // READ THE COMMON NAME (CN):
    // The CN is set during certificate generation:
    //   openssl req ... -subj "/CN=service-a"
    // It's the primary identity field used for authorization.
    const callerCn = clientCert?.subject?.CN;

    // AUTHORIZE THE CALLER:
    // ProcessService checks if this specific CN is allowed.
    // A valid cert from an unknown CN will be rejected here.
    const result = this.processService.findProRequest(callerCn);

    if (!result.success) {
      sendResponse(res, StatusCodes.Forbidden, null, result.message);
      return;
    }

    // Return success with Service B's metadata
    const data = {
      service: "service-b",
      timestamp: new Date().toISOString(),
    };

    sendResponse(res, StatusCodes.OK, data, result.message);
  });
}
