# mTLS Microservices — Project Overview

This project is a hands-on learning lab that demonstrates **Mutual TLS (mTLS)** in a real microservices architecture. By walking through every layer — from raw certificate generation to strict TypeScript controllers that inspect peer certificates — you will gain the deep, under-the-hood understanding needed to design and troubleshoot mTLS in production systems.

## What You Will Learn

| Area | Outcome |
|---|---|
| **TLS Fundamentals** | Understand the handshake, cipher negotiation, and certificate chain validation. |
| **mTLS Theory** | Know *why* standard TLS is insufficient for service-to-service trust and how mTLS closes the gap. |
| **PKI (Public Key Infrastructure)** | Be able to create a Root CA, sign service certificates, and understand chain-of-trust. |
| **Node.js Integration** | Know exactly which `https.createServer` and `https.Agent` options enforce mutual authentication. |
| **Identity-Based Access Control** | Extract the Common Name (CN) from a peer certificate and make authorization decisions. |
| **Production Readiness** | Understand what replaces manual OpenSSL commands in real deployments (cert-manager, Istio, Vault). |

## Project Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User / curl                                  │
│                     GET http://localhost:3001/api/a                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │ Plain HTTP
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Service A (Port 3001)                        │
│  ┌───────────────────┐    ┌─────────────────────┐                   │
│  │ ApiCallController │───▶│   ApiCallService     │                  │
│  │   (Express GET)   │    │ (Axios + https.Agent)│                  │
│  └───────────────────┘    └──────────┬──────────┘                   │
│                                      │                              │
│   Loads: ca.crt, service-a.crt,      │ mTLS Handshake               │
│          service-a.key               │ (Both sides present certs)   │
└──────────────────────────────────────┼──────────────────────────────┘
                                       │ HTTPS (mutual auth)
                                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Service B (Port 3002 — HTTPS only)                │
│  ┌────────────────────┐    ┌──────────────────────┐                 │
│  │ ProcessController  │───▶│  ProcessService       │                │
│  │ (TLSSocket guard)  │    │ (CN === 'service-a'?) │                │
│  └────────────────────┘    └──────────────────────┘                 │
│                                                                     │
│   Server config:                                                    │
│     requestCert: true    ← "I require your certificate"             │
│     rejectUnauthorized: true ← "If I can't verify it, drop conn"   │
│                                                                     │
│   Loads: ca.crt, service-b.crt, service-b.key                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Runtime**: Node.js with TypeScript (strict mode, zero `any` / zero `as`)
- **Framework**: Express 4.x
- **DI Container**: Awilix (Proxy injection, singleton lifecycle)
- **HTTP Client**: Axios with custom `https.Agent`
- **Logging**: Pino with pino-pretty
- **Shared Utils**: Monorepo-local `utils` package (`CertLoader`, `LogService`, `asyncHandler`, `sendResponse`, `errorMiddleware`, `isTLSSocket`)

## Document Index

| Document | Purpose |
|---|---|
| [01-overview.md](./01-overview.md) | This file — project summary and architecture |
| [02-tls-mtls-theory.md](./02-tls-mtls-theory.md) | Deep-dive theory: TLS vs mTLS, the handshake, PKI, trust chains |
| [03-manual-pki-guide.md](./03-manual-pki-guide.md) | Hands-on: generating certificates with OpenSSL |
| [04-production-pki.md](./04-production-pki.md) | What replaces manual PKI in production (cert-manager, Istio, Vault) |
| [05-project-deep-dive.md](./05-project-deep-dive.md) | Line-by-line analysis mapping every code decision to mTLS theory |
| [06-architecture.md](./06-architecture.md) | Folder structure, setup instructions, coding conventions |
