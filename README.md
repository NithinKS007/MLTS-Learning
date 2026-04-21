# Advanced mTLS Microservices (Awilix & Repository Pattern)

This project demonstrates a production-grade mTLS implementation between two isolated services. 

## Features
- **Class-Based Architecture**: Fully object-oriented using TypeScript.
- **Dependency Injection**: Powered by `Awilix` for clean component wiring.
- **Repository Pattern**: Abstracing data and external service access.
- **Zero `any`**: 100% strict type safety using generics.
- **Isolated Environments**: Each service maintains its own `node_modules` and lifecycle.

## Project Layout
- `/service-a`: Client-side microservice.
- `/service-b`: Server-side microservice with CN validation.
- `/utils`: Shared types and cert loading classes.
- `/docs`: Comprehensive architectural guides and manual PKI setup.

## Quick Start
1. Generate certificates manually: See `docs/02-manual-pki-guide.md`.
2. Install dependencies:
   ```bash
   cd utils && npm install
   cd ../service-a && npm install
   cd ../service-b && npm install
   ```
3. Run services in separate terminals:
   - `service-b`: `npm run dev` (Port 3002)
   - `service-a`: `npm run dev` (Port 3001)
4. Test: `curl http://localhost:3001/api/a`
