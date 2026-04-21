import fs from 'fs';
import path from 'path';

/**
 * utils/src/certLoader.ts — Certificate File Loader
 *
 * WHY THIS EXISTS:
 * In mTLS, both the client and server must load certificate files at startup:
 *   - ca.crt      → The Root CA certificate (trust anchor — "who do I trust?")
 *   - service.crt → The service's own certificate (identity — "who am I?")
 *   - service.key → The service's private key (proof — "I can prove I own the cert")
 *
 * This class centralizes certificate loading logic so both services
 * use the same error handling and file resolution strategy.
 *
 * HOW IT MAPS TO mTLS:
 *   Service A (Client):
 *     findCA()                → loaded into https.Agent({ ca })
 *     findCertPair('service-a') → loaded into https.Agent({ cert, key })
 *
 *   Service B (Server):
 *     findCA()                → loaded into https.createServer({ ca })
 *     findCertPair('service-b') → loaded into https.createServer({ cert, key })
 *
 * IN PRODUCTION:
 *   This class would read from Kubernetes Secret volume mounts (/etc/tls/)
 *   or call HashiCorp Vault's API instead of reading from a local directory.
 */
export class CertLoader {
  /** Absolute or relative path to the directory containing certificate files */
  private readonly certPath: string;

  constructor(certPath: string) {
    this.certPath = certPath;
  }

  /**
   * Reads a single certificate file from disk as a Buffer.
   *
   * WHY Buffer? Node.js https.createServer and https.Agent expect certificate
   * data as Buffer (raw bytes) or PEM string. Buffer is safer because it
   * preserves the exact byte content without encoding issues.
   *
   * WHY readFileSync (synchronous)?
   * Certs are loaded once at application startup. Using sync I/O keeps
   * the bootstrap code simple — no need for async/await in constructors.
   *
   * @param filename - The certificate file name (e.g., 'ca.crt', 'service-a.key')
   * @throws Error if the file does not exist at the resolved path
   */
  findBuffer(filename: string): Buffer {
    const fullPath = path.join(this.certPath, filename);

    // Fail fast with a descriptive error — a missing cert file means
    // mTLS cannot work, so there's no point continuing.
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Certificate file not found at: ${fullPath}`);
    }

    return fs.readFileSync(fullPath);
  }

  /**
   * Loads the certificate + private key pair for a named service.
   *
   * Convention: certificates follow the naming pattern:
   *   - {serviceName}.crt → the signed certificate (public, shareable)
   *   - {serviceName}.key → the private key (secret, NEVER shared)
   *
   * @param serviceName - The name of the service (e.g., 'service-a', 'service-b')
   * @returns Object containing cert (Buffer) and key (Buffer)
   */
  findCertPair(serviceName: string): { cert: Buffer; key: Buffer } {
    return {
      cert: this.findBuffer(`${serviceName}.crt`),
      key: this.findBuffer(`${serviceName}.key`)
    };
  }

  /**
   * Loads the Root CA certificate.
   *
   * The CA cert is the TRUST ANCHOR. Any certificate signed by this CA
   * will be considered valid by any party that holds this file.
   *
   * SECURITY NOTE: In production, the CA cert is public (it can be shared freely).
   * The CA's PRIVATE KEY (ca.key) is what must be guarded — it can mint new certs.
   */
  findCA(): Buffer {
    return this.findBuffer('ca.crt');
  }
}
