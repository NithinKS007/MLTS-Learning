# Architecture & Setup Guide

---

## Folder Structure

```
MLTS-Practical/
│
├── certs/                          # Certificate storage (generated manually)
│   ├── ca.key                      # Root CA private key (NEVER commit to git)
│   ├── ca.crt                      # Root CA public certificate (shared trust anchor)
│   ├── service-a.key               # Service A private key
│   ├── service-a.crt               # Service A signed certificate
│   ├── service-b.key               # Service B private key
│   └── service-b.crt               # Service B signed certificate
│
├── utils/                          # Shared utility package (monorepo-local)
│   ├── src/
│   │   ├── index.ts                # Barrel exports for the package
│   │   ├── CertLoader.ts           # Certificate file loading utility
│   │   ├── LogService.ts           # Centralized Pino logger
│   │   ├── types.ts                # Shared interfaces (IServiceResponse, IClientConfig, etc.)
│   │   ├── async.handler.ts        # Express async error wrapper (generic, no 'any')
│   │   ├── http.response.ts        # sendResponse() — standardized API responses
│   │   ├── http.status.codes.ts    # StatusCodes enum
│   │   ├── error.helper.ts         # AppError class hierarchy
│   │   ├── error.middleware.ts      # Global Express error handler
│   │   └── socket.guard.ts         # isTLSSocket type guard
│   ├── package.json
│   └── tsconfig.json
│
├── service-a/                      # mTLS Client (initiates calls)
│   ├── src/
│   │   ├── server.ts               # Entry point — bootstraps Application
│   │   ├── app.ts                  # Application class — Express setup + routes
│   │   ├── container.ts            # Awilix DI container — wires all dependencies
│   │   ├── config/
│   │   │   └── config.ts           # ConfigProvider — reads env vars
│   │   ├── controllers/
│   │   │   └── api.call.controller.ts  # HTTP handler — orchestrates the call
│   │   └── services/
│   │       └── api.call.service.ts     # Business logic — builds https.Agent, calls B
│   ├── package.json
│   └── tsconfig.json
│
├── service-b/                      # mTLS Server (enforces mutual auth)
│   ├── src/
│   │   ├── server.ts               # Entry point — bootstraps Application
│   │   ├── app.ts                  # Application class — HTTPS server + mTLS config
│   │   ├── container.ts            # Awilix DI container
│   │   ├── config/
│   │   │   └── config.ts           # ConfigProvider — reads env vars
│   │   ├── controllers/
│   │   │   └── process.controller.ts   # HTTP handler — extracts peer cert
│   │   └── services/
│   │       └── process.service.ts      # Business logic — validates CN identity
│   ├── package.json
│   └── tsconfig.json
│
└── docs/                           # Documentation
    ├── 01-overview.md              # Project summary and architecture
    ├── 02-tls-mtls-theory.md       # Deep theory: TLS, mTLS, PKI, handshake
    ├── 03-manual-pki-guide.md      # Hands-on OpenSSL certificate generation
    ├── 04-production-pki.md        # Production alternatives (cert-manager, Istio, Vault)
    ├── 05-project-deep-dive.md     # Line-by-line code analysis mapped to theory
    └── 06-architecture.md          # This file
```

---

## Setup Instructions

### Prerequisites

- Node.js ≥ 18
- OpenSSL (for certificate generation)
- npm

### 1. Generate Certificates

Follow [03-manual-pki-guide.md](./03-manual-pki-guide.md) to create all certificates in the `/certs` directory.

### 2. Install Dependencies

```bash
# Build the shared utils package first
cd utils && npm install && npm run build

# Install service dependencies
cd ../service-a && npm install
cd ../service-b && npm install
```

### 3. Run the Services

**Start Service B first** (it's the mTLS server):
```bash
cd service-b && npm run dev
# Output: Service B (mTLS) listening on port 3002
```

**Then start Service A** (the client):
```bash
cd service-a && npm run dev
# Output: Service A listening on port 3001
```

### 4. Test

```bash
curl http://localhost:3001/api/a
```

Expected response:
```json
{
  "success": true,
  "status": 200,
  "message": "Data fetched successfully from Service B",
  "data": {
    "service": "service-a",
    "message": "Service A successfully called Service B",
    "dataFromB": {
      "success": true,
      "status": 200,
      "message": "Service B processed the data securely.",
      "data": {
        "service": "service-b",
        "timestamp": "2026-04-21T15:00:13.717Z"
      }
    }
  }
}
```

---

## Coding Conventions

### Type Safety Rules

| Rule | Rationale |
|---|---|
| **Zero `any`** | Forces explicit typing; prevents silent failures in security-critical code |
| **Zero `as` assertions** | Use type guards (`instanceof`, custom guards) for narrowing instead |
| **Generics over unions** | `IServiceResponse<T>` ensures data shapes are validated at compile time |
| **`unknown` for catch blocks** | `catch (error: unknown)` with `instanceof Error` narrowing |

### Naming Conventions

| Category | Convention | Example |
|---|---|---|
| Files | `kebab.case.ts` | `api.call.controller.ts` |
| Classes | `PascalCase` | `ProcessController` |
| Interfaces | `IPascalCase` | `IProcessService` |
| Methods (retrieval) | `find` prefix | `findProRequest()`, `findCA()` |
| Controller methods | `handle` | `controller.handle` |
| Config loading | `loadConfig()` | `configProvider.loadConfig()` |

### Dependency Injection (Awilix)

All dependencies are registered as **singletons** in the container:

```typescript
const container = createContainer<ICradle>({
  injectionMode: InjectionMode.PROXY
});

container.register({
  configProvider: asClass(ConfigProvider).singleton(),
  logService: asClass(LogService).singleton(),
  processService: asClass(ProcessService).singleton(),
  processController: asClass(ProcessController).singleton()
});
```

Constructor injection uses **destructured cradle**:
```typescript
constructor({ processService }: { processService: IProcessService }) {
  this.processService = processService;
}
```

### Standardized API Responses

Every endpoint uses the `sendResponse` helper to ensure a consistent structure:

```typescript
{
  success: boolean,    // true if 2xx
  status: number,      // HTTP status code
  message: string,     // Human-readable description
  data: T | null       // Response payload (generic)
}
```

### Error Handling Pipeline

```
Controller method (wrapped by asyncHandler)
  │
  │ throws AppError or unhandled error
  ▼
asyncHandler catches → calls next(error)
  │
  ▼
errorMiddleware → sends standardized error response via sendResponse
```

---

## Environment Variables

| Variable | Default | Service | Purpose |
|---|---|---|---|
| `SERVICE_A_PORT` | `3001` | A | HTTP listen port |
| `SERVICE_B_PORT` | `3002` | B | HTTPS listen port |
| `SERVICE_B_URL` | `https://localhost:3002/api/b` | A | Target URL for mTLS call |
| `CERTS_DIR` | `../../../certs` (relative) | A & B | Path to certificate files |

---

## Monorepo Dependency Graph

```
utils (shared library)
  ├── express ^4.18.2
  ├── @types/express ^4.17.17   ← MUST match services
  ├── pino ^10.x
  └── pino-pretty ^13.x

service-a (depends on utils)
  ├── utils → file:../utils
  ├── express ^4.18.2           ← Same version as utils
  ├── @types/express ^4.17.17   ← Same version as utils
  ├── axios ^1.x
  └── awilix ^8.x

service-b (depends on utils)
  ├── utils → file:../utils
  ├── express ^4.18.2           ← Same version as utils
  ├── @types/express ^4.17.17   ← Same version as utils
  └── awilix ^8.x
```

> **Critical**: The `express` and `@types/express` versions must be identical across `utils`, `service-a`, and `service-b`. A mismatch causes TypeScript type incompatibility errors (e.g., `Response` from utils ≠ `Response` from service-a) because TypeScript uses structural typing with nominal checks for complex library types.
