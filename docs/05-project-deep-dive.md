# Project Deep Dive — Mapping Code to mTLS Theory

This document walks through every critical file in the project and explains **why** the code is written the way it is, connecting each line back to mTLS and PKI theory. After reading this, you should be able to point at any line and explain the security implication behind it.

---

## 1. The Server Side — Service B Enforces mTLS

Service B is the **mTLS server**. It is the gatekeeper that demands proof of identity from every caller.

### 1.1 Creating the HTTPS Server

**File**: `service-b/src/app.ts` — `Application.start()`

```typescript
const server = https.createServer({
  ca,                        // ① Trust store
  cert,                      // ② Server identity
  key,                       // ③ Server proof of ownership
  requestCert: true,         // ④ "Show me YOUR certificate"
  rejectUnauthorized: true   // ⑤ "If I can't verify it, drop the connection"
}, this.app);
```

| Option | mTLS Theory Mapping | What Happens Without It |
|---|---|---|
| **`ca`** (ca.crt) | The **trust anchor**. Node.js uses this to verify the signature on any incoming client certificate. Maps to Step 6a in the handshake. | Node.js would use the system's default CA bundle (Let's Encrypt, DigiCert, etc.) — useless for internal service certs. |
| **`cert`** (service-b.crt) | Service B's **signed certificate** presented to the client during Step 3 of the handshake. Contains B's public key + CN=service-b + CA signature. | TLS handshake fails — the server has no identity to present. |
| **`key`** (service-b.key) | Service B's **private key**. Used to create the `CertificateVerify` message (Step 3) that proves B actually owns the certificate. | Handshake fails — B can't prove it owns the cert. Anyone could steal `service-b.crt` (it's public), but without the key it's useless. |
| **`requestCert: true`** | **This is what makes it mTLS.** During the handshake, the server sends a `CertificateRequest` message to the client (Step 5). Without this, it's just standard one-way TLS. | Standard TLS — the server doesn't ask for the client's certificate. No mutual authentication. |
| **`rejectUnauthorized: true`** | **Enforcement policy.** If the client's certificate fails verification (invalid signature, expired, unknown CA), Node.js drops the TCP connection immediately. | The connection is allowed even with an invalid cert. `req.socket.getPeerCertificate()` would still work, but the cert might be forged. Dangerous. |

**Key Insight**: `requestCert` and `rejectUnauthorized` work together. `requestCert: true` says *"ask for a cert"*, `rejectUnauthorized: true` says *"reject the connection if the cert is invalid"*. Setting `requestCert: true` with `rejectUnauthorized: false` allows optional client auth (you can inspect the cert but don't require it).

### 1.2 Loading Certificates — CertLoader

**File**: `utils/src/CertLoader.ts`

```typescript
export class CertLoader {
  private readonly certPath: string;

  constructor(certPath: string) {
    this.certPath = certPath;
  }

  findBuffer(filename: string): Buffer {
    const fullPath = path.join(this.certPath, filename);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Certificate file not found at: ${fullPath}`);
    }
    return fs.readFileSync(fullPath);
  }

  findCertPair(serviceName: string): { cert: Buffer; key: Buffer } {
    return {
      cert: this.findBuffer(`${serviceName}.crt`),
      key: this.findBuffer(`${serviceName}.key`)
    };
  }

  findCA(): Buffer {
    return this.findBuffer('ca.crt');
  }
}
```

**Why `Buffer` and not `string`?** Node.js `https.createServer` and `https.Agent` accept certificate data as `Buffer` (raw bytes) or `string` (PEM-encoded). Using `readFileSync` returns a `Buffer`, which is the safest format — it preserves the exact byte content without encoding issues.

**Why `readFileSync` (synchronous)?** Certificates are loaded once at startup. Async file I/O would add unnecessary complexity for a one-time, blocking operation. In production, the cert files would come from Kubernetes Secrets (mounted volumes) or Vault API calls instead.

**Why separate `findCertPair` and `findCA`?** They model distinct PKI concepts:
- `findCA()` → loads the **trust store** (who do I trust?)
- `findCertPair(name)` → loads the **identity** (who am I?) + **proof** (my private key)

---

## 2. The Client Side — Service A Initiates mTLS

Service A is the **mTLS client**. It must present its own certificate when connecting to Service B.

### 2.1 Building the HTTPS Agent

**File**: `service-a/src/services/api.call.service.ts`

```typescript
const agent = new https.Agent({
  ca,                        // ① Trust store (same CA as server)
  cert,                      // ② Client identity (service-a.crt)
  key,                       // ③ Client proof of ownership (service-a.key)
  rejectUnauthorized: true,  // ④ "I verify the server too"
  keepAlive: true            // ⑤ Reuse the TLS session
});

this.client = axios.create({
  httpsAgent: agent,
  timeout: 5000
});
```

| Option | mTLS Theory Mapping |
|---|---|
| **`ca`** (ca.crt) | Service A uses this to verify **Service B's certificate** (Step 4 of the handshake). Since both services' certs are signed by the same CA, the same `ca.crt` works. |
| **`cert`** (service-a.crt) | Presented to Service B when it requests a client certificate (Step 5). This is the **mutual** part — the client proves its identity too. |
| **`key`** (service-a.key) | Used to create the `CertificateVerify` message (Step 5). Proves Service A owns `service-a.crt`. |
| **`rejectUnauthorized: true`** | Service A also verifies Service B's cert. This prevents MITM attacks where an attacker impersonates Service B. |
| **`keepAlive: true`** | **TLS session resumption.** After the first full handshake, subsequent connections reuse the negotiated session parameters. This saves the ~2ms handshake overhead on repeated calls. |

**Why lazy initialization (`if (!this.client)`)?** The `https.Agent` and the TLS session pool are heavyweight objects. Creating them once and reusing them across requests is a standard practice for:
1. **Performance**: Avoids repeating the TLS handshake for every HTTP request
2. **Resource efficiency**: Maintains a connection pool with `keepAlive`
3. **File I/O**: Reads certificate files only once

### 2.2 The Symmetry of Trust

Notice that both services load the **same `ca.crt`** but **different cert/key pairs**:

```
Service A loads:                    Service B loads:
  ca.crt       (trust anchor)        ca.crt       (same trust anchor)
  service-a.crt (my identity)        service-b.crt (my identity)
  service-a.key (my proof)           service-b.key (my proof)
```

This is the fundamental design of mutual TLS — both sides share the same CA but have unique identities. If a third `service-c` joins, you only need to generate `service-c.crt` and `service-c.key` signed by the same CA. No changes to existing services.

---

## 3. Application-Level Identity Verification

After the TLS handshake succeeds (transport-layer trust), the application performs **authorization** (application-layer trust).

### 3.1 Extracting the Peer Certificate

**File**: `service-b/src/controllers/process.controller.ts`

```typescript
// Type guard — narrows req.socket to TLSSocket safely
if (!isTLSSocket(req.socket)) {
  sendResponse(res, StatusCodes.Forbidden, null, "Secure connection required.");
  return;
}

// After narrowing, TypeScript knows req.socket has getPeerCertificate()
const clientCert = req.socket.getPeerCertificate();
const callerCn = clientCert?.subject?.CN;
```

**Why `isTLSSocket` type guard?** The `req.socket` in Express is typed as `net.Socket`, which does NOT have `getPeerCertificate()`. In an mTLS context, the socket is actually a `tls.TLSSocket` (a subclass of `net.Socket`). The type guard:
1. Performs a runtime `instanceof` check — verifying the socket IS a TLS socket
2. Narrows the TypeScript type — enabling safe access to `.getPeerCertificate()` without `as` assertions
3. Handles edge cases — if someone somehow hits this endpoint over plain HTTP, the guard catches it

**What does `getPeerCertificate()` return?** A `tls.PeerCertificate` object containing:
```typescript
{
  subject: { CN: 'service-a', O: 'mTLSDemo', ... },
  issuer:  { CN: 'mTLSDemoRootCA', O: 'mTLSDemo', ... },
  valid_from: 'Apr 21 00:00:00 2026 GMT',
  valid_to:   'Apr 21 00:00:00 2027 GMT',
  fingerprint: '5A:3B:...',
  serialNumber: '...',
  raw: Buffer  // DER-encoded certificate bytes
}
```

### 3.2 Authorization by Common Name

**File**: `service-b/src/services/process.service.ts`

```typescript
findProRequest(callerCn?: string): IServiceResponse<null> {
  if (!callerCn) {
    this.logService.warn('Anonymous request rejected');
    return { success: false, message: 'Client certificate required.', data: null };
  }

  if (callerCn !== 'service-a') {
    this.logService.warn(`Unauthorized access attempt from ${callerCn}`);
    return { success: false, message: 'Identity untrusted.', data: null };
  }

  this.logService.info(`Securely processed request for ${callerCn}`);
  return { success: true, message: 'Service B processed the data securely.', data: null };
}
```

**The Two-Level Trust Model in action:**

| Check | Level | Where It Happens | What It Answers |
|---|---|---|---|
| "Is this certificate signed by our CA?" | **Transport** | Node.js TLS handshake (`rejectUnauthorized`) | "Is this a valid certificate?" |
| "Is `CN === 'service-a'`?" | **Application** | `ProcessService.findProRequest()` | "Is this specific identity *authorized*?" |

**Why both levels?** Imagine you have 10 services, all with valid certs signed by the same CA. Without the CN check, `logging-service` (with CN=logging-service) could call Service B's internal endpoint. The application-level check creates an **access control list** — only `service-a` is allowed.

**Real-world extension**: In production, you would typically use a configuration-driven allowlist or a policy engine (like Open Policy Agent) instead of hardcoding `'service-a'`.

---

## 4. The Complete Request Flow (Traced End-to-End)

```
User: curl http://localhost:3001/api/a
  │
  │ ① Plain HTTP (no TLS — user → Service A is unencrypted)
  ▼
Service A: ApiCallController.handle()
  │
  │ ② Load config → serviceBUrl = "https://localhost:3002/api/b"
  │
  │ ③ Initialize https.Agent (if first call):
  │     - Read ca.crt, service-a.crt, service-a.key from /certs
  │     - Create Axios instance with the agent
  │
  │ ④ axios.get("https://localhost:3002/api/b")
  │     │
  │     │ ── TCP Handshake ──────────────────────────────────────────
  │     │ ── TLS ClientHello ────────────────────────────────────────
  │     │ ◄─ TLS ServerHello + service-b.crt + CertificateVerify ───
  │     │
  │     │ ⑤ Service A validates service-b.crt against ca.crt ✅
  │     │
  │     │ ── service-a.crt + CertificateVerify ─────────────────────
  │     │
  │     │ ⑥ Service B validates service-a.crt against ca.crt ✅
  │     │    (rejectUnauthorized: true — drop if invalid)
  │     │
  │     │ ── Symmetric Key Derived (both sides) ────────────────────
  │     │ ── Encrypted HTTP GET /api/b ─────────────────────────────
  │     ▼
Service B: ProcessController.handle()
  │
  │ ⑦ isTLSSocket(req.socket) → true (we're on HTTPS)
  │
  │ ⑧ req.socket.getPeerCertificate() → { subject: { CN: 'service-a' } }
  │
  │ ⑨ ProcessService.findProRequest('service-a')
  │     → CN matches → { success: true, message: '...', data: null }
  │
  │ ⑩ sendResponse(res, 200, { service: 'service-b', timestamp: '...' }, '...')
  │
  │ ── Encrypted HTTP 200 Response ──────────────────────────────────
  ▼
Service A: receives dataFromB
  │
  │ ⑪ sendResponse(res, 200, { service: 'service-a', dataFromB }, '...')
  │
  │ ── Plain HTTP 200 Response ──────────────────────────────────────
  ▼
User: receives final JSON
```

---

## 5. Security Analysis — What This Project Protects Against

| Attack | How mTLS Prevents It | Relevant Code |
|---|---|---|
| **Eavesdropping** | All Service A ↔ B traffic is encrypted with AES-GCM after the handshake | `https.createServer()` + `https.Agent()` |
| **Server Impersonation** | Service A verifies Service B's cert against `ca.crt` | `rejectUnauthorized: true` in Agent |
| **Client Impersonation** | Service B verifies Service A's cert against `ca.crt` | `requestCert: true, rejectUnauthorized: true` |
| **Unauthorized Service** | Even with a valid cert, if CN ≠ 'service-a', request is rejected | `ProcessService.findProRequest()` |
| **Replay Attacks** | TLS uses random nonces and session-unique keys; replayed packets fail HMAC verification | Built into TLS protocol |
| **Certificate Theft** | Stolen `.crt` file is useless without the `.key` file | `CertificateVerify` requires the private key |

### What This Project Does NOT Protect Against (Limitations)

| Gap | Explanation | Production Solution |
|---|---|---|
| User → Service A is plain HTTP | The first hop is unencrypted | Put an HTTPS reverse proxy (Nginx/ALB) in front |
| No certificate revocation | If `service-a.key` is compromised, the cert stays valid until expiry | Use CRL/OCSP or short-lived certs (Vault, cert-manager) |
| Long-lived certificates (365 days) | Large window for compromise | Short TTLs (1h-24h) with auto-rotation |
| Hardcoded CN check | Only `service-a` is authorized; doesn't scale | Use a policy engine (OPA) or config-driven allowlists |

---

## 6. TypeScript Design Decisions (Why They Matter for Security)

### 6.1 Zero `any` / Zero `as` Policy

```typescript
// ❌ Dangerous — silently bypasses type checking
const socket = req.socket as any;
const cert = socket.getPeerCertificate(); // No compile-time guarantee this method exists

// ✅ Safe — runtime check + compile-time narrowing
if (!isTLSSocket(req.socket)) {
  sendResponse(res, StatusCodes.Forbidden, null, "Secure connection required.");
  return;
}
const cert = req.socket.getPeerCertificate(); // TypeScript guarantees this is valid
```

In security-critical code, type safety is not a style preference — it prevents classes of bugs where you accidentally skip validation or call methods on the wrong object type.

### 6.2 Generic `IServiceResponse<T>`

```typescript
export interface IServiceResponse<T> {
  success: boolean;
  message: string;
  data: T;
}
```

The generic parameter `<T>` ensures that response data shapes are checked at compile time. When `ProcessService` returns `IServiceResponse<null>`, the compiler guarantees that `data` is `null` — not an arbitrary object that could leak sensitive info.

### 6.3 `asyncHandler` Without Type Assertions

```typescript
export const asyncHandler = <P, ResBody, ReqBody, ReqQuery>(
  controllerMethod: (
    req: Request<P, ResBody, ReqBody, ReqQuery>,
    res: Response<ResBody>,
    next: NextFunction
  ) => Promise<void>
): RequestHandler<P, ResBody, ReqBody, ReqQuery> => {
  return (req, res, next) => {
    controllerMethod(req, res, next).catch(next);
  };
};
```

This returns a proper `RequestHandler` — compatible with Express's `.get()` / `.post()` without any `as any` cast. The generics propagate the request/response types through from controller to route registration.
