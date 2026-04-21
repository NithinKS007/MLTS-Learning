import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { ConfigProvider } from '../config/config';
import { CertLoader } from 'utils';

/**
 * service-a/src/services/api.call.service.ts — mTLS Client Service
 *
 * THIS IS WHERE THE mTLS MAGIC HAPPENS ON THE CLIENT SIDE.
 *
 * This service builds an HTTPS client (Axios) configured with:
 *   - ca.crt        → Trust store: "I trust certs signed by this CA"
 *   - service-a.crt → My identity: "Here's my certificate for the server to verify"
 *   - service-a.key → My proof: "I can prove I own this certificate"
 *
 * When this client makes a request to Service B:
 *   1. TLS handshake begins
 *   2. Service B presents its certificate → this client verifies it against ca.crt
 *   3. Service B requests client certificate (requestCert: true)
 *   4. This client presents service-a.crt + proves ownership via service-a.key
 *   5. Both sides derive a shared encryption key → data is encrypted
 *
 * LAZY INITIALIZATION:
 * The https.Agent is created on the first call and reused for subsequent calls.
 * This avoids re-reading certificate files and re-negotiating TLS sessions.
 */

/** Interface for dependency injection and testing */
export interface IApiCallService {
  fetchData<T>(path: string): Promise<T | void>;
}

export class ApiCallService implements IApiCallService {
  /** Config provider for reading cert paths and Service B URL */
  private readonly configProvider: ConfigProvider;

  /**
   * Cached Axios instance with the mTLS agent attached.
   * Undefined until the first call (lazy initialization).
   */
  private client: AxiosInstance | undefined;

  constructor({ configProvider }: { configProvider: ConfigProvider }) {
    this.configProvider = configProvider;
  }

  /**
   * Fetch data from a downstream service over mTLS.
   *
   * @template T - Expected response shape (compile-time validated)
   * @param url - The full URL to call (e.g., https://localhost:3002/api/b)
   * @returns The parsed response data, typed as T
   *
   * HOW THE https.Agent CONFIG MAPS TO mTLS:
   *
   *   ca:   Buffer → Root CA certificate
   *         Node.js uses this to verify Service B's certificate.
   *         "Is service-b.crt signed by a CA I trust?"
   *
   *   cert: Buffer → Service A's own certificate
   *         Sent to Service B during the TLS handshake.
   *         "Here's my identity — I am service-a."
   *
   *   key:  Buffer → Service A's private key
   *         Used to create the CertificateVerify message.
   *         "I can prove I own the cert above."
   *         NOTE: This key NEVER leaves Service A — it's used locally for signing.
   *
   *   rejectUnauthorized: true
   *         "If Service B's cert fails verification, abort the connection."
   *         Prevents man-in-the-middle attacks.
   *
   *   keepAlive: true
   *         Reuses the TLS session for subsequent requests.
   *         Avoids the ~2ms TLS handshake overhead on repeated calls.
   */
  async fetchData<T>(url: string): Promise<T | void> {
    const config = this.configProvider.loadConfig();

    // Lazy init: build the HTTPS agent only on the first call
    if (!this.client) {
      const loader = new CertLoader(config.certsDir);

      // Load the Root CA — the trust anchor for verifying Service B
      const ca = loader.findCA();

      // Load Service A's own identity (cert + private key)
      const { cert, key } = loader.findCertPair('service-a');

      // Create an HTTPS agent with full mTLS configuration
      const agent = new https.Agent({
        ca,                        // Who do I trust? → Our internal CA
        cert,                      // Who am I? → service-a
        key,                       // Prove it → my private key
        rejectUnauthorized: true,  // Enforce server certificate validation
        keepAlive: true            // Reuse TLS sessions for performance
      });

      // Create an Axios instance bound to the mTLS agent
      this.client = axios.create({
        httpsAgent: agent,
        timeout: 5000  // 5-second timeout to prevent hanging connections
      });
    }

    // Make the actual HTTPS GET request — mTLS handshake happens transparently
    const response = await this.client.get<T>(url);
    return response.data;
  }
}
