# Production PKI — What Replaces Manual Certificates

In this project, you generated certificates manually with OpenSSL. In production, this approach has critical weaknesses:

| Manual PKI Problem | Impact |
|---|---|
| CA private key sits on a developer's machine | Single point of compromise |
| Certificates are valid for 365 days | Long-lived credentials = bigger blast radius |
| No automated rotation | Expired certs cause outages |
| No revocation mechanism | Compromised cert stays valid until expiry |
| Human-driven process | Prone to errors, doesn't scale to 100+ services |

This document covers the three dominant production approaches.

---

## 1. Kubernetes cert-manager (Infrastructure-Level)

### What It Is

**cert-manager** is a Kubernetes-native controller that automates certificate lifecycle management. It watches for `Certificate` custom resources and automatically:
1. Generates private keys
2. Creates CSRs
3. Submits them to a CA (internal or external like Let's Encrypt)
4. Stores signed certificates as Kubernetes Secrets
5. Rotates certificates before expiry

### How It Works

```yaml
# cert-manager Certificate resource
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: service-b-cert
  namespace: backend
spec:
  secretName: service-b-tls           # K8s Secret where cert + key are stored
  duration: 720h                       # 30 days (short-lived!)
  renewBefore: 168h                    # Renew 7 days before expiry
  issuerRef:
    name: internal-ca                  # Points to your internal CA issuer
    kind: ClusterIssuer
  commonName: service-b
  dnsNames:
    - service-b
    - service-b.backend.svc.cluster.local
```

```yaml
# The CA Issuer (uses a root CA stored as a K8s Secret)
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: internal-ca
spec:
  ca:
    secretName: root-ca-key-pair       # Contains ca.crt + ca.key
```

### Mapping to This Project

| This Project (Manual) | Production (cert-manager) |
|---|---|
| `openssl genrsa -out service-b.key 2048` | cert-manager generates the key automatically |
| `openssl req -new ... -out service-b.csr` | cert-manager creates the CSR internally |
| `openssl x509 -req ... -out service-b.crt` | cert-manager signs it using the ClusterIssuer |
| Files in `/certs` directory | Kubernetes Secret mounted as volume |
| Manual rotation (none) | Auto-rotation before expiry |

### How Services Consume the Certs

```yaml
# Service B Deployment — cert is auto-mounted
spec:
  containers:
    - name: service-b
      volumeMounts:
        - name: tls-certs
          mountPath: /etc/tls
          readOnly: true
  volumes:
    - name: tls-certs
      secret:
        secretName: service-b-tls   # Created by cert-manager
```

Your `CertLoader` would then read from `/etc/tls/tls.crt` and `/etc/tls/tls.key` instead of the local `/certs` directory.

---

## 2. Service Mesh — Istio / Linkerd (Transparent mTLS)

### What It Is

A service mesh injects a **sidecar proxy** (Envoy for Istio, Linkerd-proxy for Linkerd) next to every service container. The sidecar handles **all** TLS/mTLS operations transparently — your application code doesn't need to know about certificates at all.

### How It Works

```
┌──────────────────────────────────────────┐
│              Pod: Service A              │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │ Your App     │──│ Envoy Sidecar    │  │
│  │ (plain HTTP) │  │ (handles mTLS)   │  │
│  └──────────────┘  └───────┬──────────┘  │
└────────────────────────────┼─────────────┘
                             │ mTLS (automatic)
┌────────────────────────────┼─────────────┐
│              Pod: Service B              │
│  ┌──────────────────┐  ┌──────────────┐  │
│  │ Envoy Sidecar    │──│ Your App     │  │
│  │ (handles mTLS)   │  │ (plain HTTP) │  │
│  └──────────────────┘  └──────────────┘  │
└──────────────────────────────────────────┘
```

**Key insight**: Your application sends plain HTTP to `localhost`. The sidecar intercepts it, wraps it in mTLS, sends it to the destination sidecar, which unwraps and forwards plain HTTP to the destination app.

### Istio PeerAuthentication Policy

```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: backend
spec:
  mtls:
    mode: STRICT   # Every pod-to-pod call MUST use mTLS
```

### Mapping to This Project

| This Project | Istio Service Mesh |
|---|---|
| `CertLoader` reads cert files | Envoy sidecar manages certs automatically |
| `https.Agent` with cert/key | Envoy handles TLS termination |
| `req.socket.getPeerCertificate()` | Envoy injects identity headers (e.g., `x-forwarded-client-cert`) |
| `ProcessService` checks CN | AuthorizationPolicy checks service identity (SPIFFE) |
| `https.createServer` with requestCert | PeerAuthentication mode: STRICT |

### Trade-offs

| Advantage | Disadvantage |
|---|---|
| Zero application code changes | Added complexity (control plane, sidecar resources) |
| Automatic cert rotation (every ~24h) | Latency overhead from sidecar proxying |
| Centralized security policies | Debugging is harder (traffic goes through proxy) |
| Works across any language/framework | Requires Kubernetes |

---

## 3. HashiCorp Vault (Secrets-Centric Approach)

### What It Is

Vault's **PKI Secrets Engine** acts as a programmable CA. Services call the Vault API to request short-lived certificates on demand.

### How It Works

```
Service A starts up
   │
   ├── Authenticates to Vault (via Kubernetes ServiceAccount, AppRole, etc.)
   │
   ├── Requests a certificate:
   │     POST /v1/pki/issue/service-a-role
   │     { "common_name": "service-a", "ttl": "1h" }
   │
   ├── Receives:
   │     { "certificate": "...", "private_key": "...", "ca_chain": ["..."] }
   │
   └── Uses cert for mTLS connections (renews before TTL expiry)
```

### Vault PKI Setup (Simplified)

```bash
# Enable PKI engine
vault secrets enable pki

# Configure CA (or import an existing one)
vault write pki/root/generate/internal \
  common_name="My Organization Root CA" \
  ttl=87600h

# Create a role defining what certs can be issued
vault write pki/roles/service-a-role \
  allowed_domains="service-a" \
  allow_bare_domains=true \
  max_ttl="24h"

# Service A requests a cert
vault write pki/issue/service-a-role \
  common_name="service-a" \
  ttl="1h"
```

### Mapping to This Project

| This Project | Vault PKI |
|---|---|
| `openssl genrsa` + `openssl req` | `vault write pki/issue/...` (one API call) |
| 365-day certificate validity | 1-hour TTL (much safer) |
| CA key on disk | CA key inside Vault's encrypted storage |
| No revocation | `vault write pki/revoke serial_number=...` |
| Manual rotation | Automatic rotation via Vault Agent or SDK |

---

## Comparison Matrix

| Feature | Manual (This Project) | cert-manager | Istio/Service Mesh | Vault PKI |
|---|---|---|---|---|
| **Effort** | Minimal setup | Medium | High | Medium |
| **Rotation** | Manual | Automatic | Automatic (~24h) | Automatic (configurable TTL) |
| **Revocation** | None | CRL/OCSP support | Automatic | Built-in |
| **App Code Changes** | Full control | Minimal (mount paths) | Zero | Minimal (API calls) |
| **Platforms** | Anywhere | Kubernetes only | Kubernetes only | Anywhere |
| **Best For** | Learning & dev | K8s-native PKI | Full mesh security | Multi-platform secrets |
| **Used At** | This project | Shopify, GitLab | Google, Lyft, eBay | HashiCorp, Stripe |

---

## Recommendation for Real Projects

- **Kubernetes-only?** → Start with **cert-manager**. If you need service-to-service policies, add **Istio**.
- **Multi-platform (K8s + VMs + cloud functions)?** → Use **Vault PKI**.
- **Learning / local development?** → Manual OpenSSL (this project) is perfect.

The manual approach in this project teaches you the exact same concepts that every production tool automates. The difference is scale — not the underlying cryptography.
