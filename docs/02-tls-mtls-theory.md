# TLS & mTLS — Complete Theory Guide

This document gives you the deep, under-the-hood understanding of TLS and mTLS so you can design, debug, and explain mutual authentication in real systems.

---

## 1. The Problem: Why Do We Need Any of This?

When two services communicate over a network, three threats exist:

| Threat | What It Means | Example |
|---|---|---|
| **Eavesdropping** | An attacker reads traffic in transit | Sniffing database credentials between services |
| **Tampering** | An attacker modifies data in transit | Changing a payment amount mid-request |
| **Impersonation** | An attacker pretends to be a trusted service | A rogue container acting as "payment-service" |

**TLS** solves eavesdropping and tampering. **mTLS** additionally solves impersonation — in both directions.

---

## 2. Cryptography Primitives (Building Blocks)

Before understanding TLS, you must understand these three concepts:

### 2.1 Symmetric Encryption (Shared Secret)

Both parties use the **same key** to encrypt and decrypt. It is fast but has a key distribution problem — how do you securely share the key in the first place?

```
Service A ---[encrypted with KEY_X]---> Service B
Service B decrypts with the same KEY_X
```

**Examples**: AES-256-GCM, ChaCha20-Poly1305.

### 2.2 Asymmetric Encryption (Public/Private Key Pair)

Each party has **two mathematically linked keys**:
- **Public Key**: Can be freely shared. Used to **encrypt** data or **verify** a signature.
- **Private Key**: Must be kept secret. Used to **decrypt** data or **create** a signature.

```
Service A encrypts with Service B's PUBLIC key
   → Only Service B can decrypt (with its PRIVATE key)
```

**Why not use it for everything?** It is ~1000x slower than symmetric encryption. So TLS uses asymmetric encryption only to negotiate a shared symmetric key, then switches to fast symmetric encryption for the actual data.

**Examples**: RSA-2048, ECDSA P-256.

### 2.3 Digital Signatures (Proof of Authorship)

A digital signature proves that a message was created by the holder of a specific private key and has not been tampered with:

```
1. Service A hashes the message → digest
2. Service A encrypts the digest with its PRIVATE key → signature
3. Service B decrypts the signature with A's PUBLIC key → original digest
4. Service B hashes the received message → new digest
5. If original digest === new digest → message is authentic and untampered
```

This is exactly how certificates are verified in TLS.

---

## 3. Certificates & PKI (Public Key Infrastructure)

### 3.1 What Is a Certificate?

A certificate is a **digitally signed document** that binds a public key to an identity. Think of it as a passport for a service:

| Field | Passport Analogy | Certificate Example |
|---|---|---|
| **Subject (CN)** | Your name | `CN=service-b` |
| **Issuer** | Issuing government | `CN=mTLSDemoRootCA` |
| **Public Key** | Your biometric data | RSA 2048-bit public key |
| **Validity** | Expiry date | Not After: 2027-04-21 |
| **Signature** | Government stamp | SHA-256 digital signature by the CA |

The standard format is **X.509v3**, encoded as PEM (`.crt`, `.pem`) or DER (`.der`).

### 3.2 What Is a Certificate Authority (CA)?

A CA is the **trusted third party** that signs certificates. When a CA signs a certificate, it is vouching: *"I have verified that this public key belongs to the entity named in the Subject field."*

```
Root CA (self-signed, ultimate trust anchor)
  │
  ├── signs → service-a.crt (CN=service-a)
  └── signs → service-b.crt (CN=service-b)
```

### 3.3 Chain of Trust

Any party that trusts the Root CA will automatically trust any certificate signed by that CA. This is the **chain of trust**:

```
1. Service B presents service-b.crt to Service A
2. Service A checks: "Who signed this cert?" → mTLSDemoRootCA
3. Service A checks: "Do I trust mTLSDemoRootCA?" → Yes (ca.crt is in my trust store)
4. Service A verifies the CA's signature on service-b.crt using the CA's public key
5. If valid → Service B's identity is confirmed
```

In production, there are often **intermediate CAs** between the root and leaf certificates (Root CA → Intermediate CA → Service Cert), forming a longer chain.

### 3.4 Certificate Signing Request (CSR)

A CSR is how a service asks the CA to generate a signed certificate:

```
1. Service generates a key pair (public + private)
2. Service creates a CSR containing: its public key + its desired identity (CN=service-a)
3. Service sends CSR to the CA
4. CA verifies the request, signs it with the CA's private key
5. CA returns the signed certificate (.crt)
6. Service now has: its private key + its signed certificate
```

The private key **never leaves the service**. Only the public key travels inside the CSR.

---

## 4. TLS (Transport Layer Security)

### 4.1 What Is TLS?

TLS is a protocol that creates an encrypted tunnel between two endpoints. It sits between the application layer (HTTP) and the transport layer (TCP):

```
Application:  HTTP request / response
                    ↕
TLS:          Encryption + Authentication
                    ↕
Transport:    TCP segments
                    ↕
Network:      IP packets
```

When HTTP travels over TLS, we call it HTTPS.

### 4.2 The TLS 1.3 Handshake (Step-by-Step)

TLS 1.3 completes the handshake in a single round-trip (1-RTT), unlike TLS 1.2 which required two.

```
Service A (Client)                              Service B (Server)
──────────────────                              ──────────────────

1. ClientHello ─────────────────────────────────▶
   • Supported cipher suites
   • Client random (nonce)
   • Key share (ECDHE public key)
   • Supported TLS versions

                                    2. ServerHello ◀──────────────
                                       • Chosen cipher suite
                                       • Server random (nonce)
                                       • Key share (ECDHE public key)
                                       • {EncryptedExtensions}
                                       • {Certificate} ← server's cert
                                       • {CertificateVerify} ← signature
                                       • {Finished}

3. ─────────────────────────────────────────────▶
   • {Certificate}        ← client's cert (ONLY in mTLS!)
   • {CertificateVerify}  ← signature      (ONLY in mTLS!)
   • {Finished}

4. ◀───────── Application Data (encrypted) ────▶
```

**Key Insight**: After step 2, both sides derive the **same symmetric session key** using their exchanged ECDHE public keys plus their private keys. This is called the *Diffie-Hellman key exchange*. From this point, all data is encrypted with fast symmetric encryption (AES-GCM).

### 4.3 What Standard TLS Proves

In standard TLS (one-way):

| Question | Answered? |
|---|---|
| Is the connection encrypted? | ✅ Yes |
| Is Service B who it claims to be? | ✅ Yes (client verifies server cert) |
| Is Service A who it claims to be? | ❌ No — the server has no proof |

This is perfectly fine for browser → server communication (your browser verifies google.com's cert). But for service-to-service communication, **both sides need to prove identity**.

---

## 5. mTLS (Mutual TLS) — The Key Difference

### 5.1 What Is mTLS?

**Mutual TLS** = standard TLS + the client also presents a certificate to the server. Both endpoints authenticate each other.

| Feature | Standard TLS | Mutual TLS (mTLS) |
|---|---|---|
| Server proves identity to client | ✅ | ✅ |
| Client proves identity to server | ❌ | ✅ |
| Encryption of data in transit | ✅ | ✅ |
| Integrity protection | ✅ | ✅ |
| Who authenticates? | Client authenticates server only | Both sides authenticate each other |
| Certificate required by | Server only | Both server AND client |
| Use case | Browser ↔ Website | Service ↔ Service |

### 5.2 Why mTLS? (The "Why")

**Problem**: In a microservices architecture, you have 10, 50, or 500 services communicating. How does `order-service` know that the request hitting its `/internal/create` endpoint is actually from `payment-service` and not from an attacker who breached the network perimeter?

**Solutions and their weaknesses**:

| Approach | Weakness |
|---|---|
| IP allowlisting | IPs change in containers/Kubernetes pods |
| API keys in headers | Keys can be stolen, logged, leaked |
| JWT tokens | Requires a token issuer, tokens can be stolen |
| Network segmentation | Doesn't protect against compromised pods in the same segment |
| **mTLS** | **Identity is cryptographically bound to the connection itself** |

With mTLS, the identity is embedded in the TLS handshake. You cannot intercept and replay it because the private key never travels over the wire. This is called **Zero Trust Networking** — *"never trust, always verify"*.

### 5.3 When to Use mTLS (The "When")

| Scenario | Use mTLS? | Why |
|---|---|---|
| Internal microservice ↔ microservice calls | ✅ Always | Zero-trust: prove who's calling |
| Database connections | ✅ Recommended | Prevent rogue clients from connecting |
| Third-party API integrations | ✅ If supported | Bank APIs, payment gateways often require it |
| Browser ↔ web server | ❌ Rarely | Users don't have client certificates |
| Public REST APIs | ❌ No | Use OAuth2/API keys instead |

### 5.4 How mTLS Works (The "How")

Let's trace exactly what happens when Service A calls Service B in this project:

```
Step 1: TCP Connection
  Service A connects to Service B on port 3002 (TCP handshake)

Step 2: ClientHello
  Service A sends: "I support TLS 1.3, these cipher suites, here's my ECDHE key share"

Step 3: ServerHello + Server Certificate
  Service B sends:
    - Chosen cipher suite
    - Server's ECDHE key share
    - service-b.crt (signed by mTLSDemoRootCA)
    - CertificateVerify (Service B signs a hash with its private key)

Step 4: Client Validates Server
  Service A performs:
    a) Extract the issuer from service-b.crt → "mTLSDemoRootCA"
    b) Find ca.crt in its trust store (httpsAgent.ca = ca.crt)
    c) Verify the CA's digital signature on service-b.crt
    d) Check certificate expiry
    e) Check CertificateVerify → proves Service B holds the private key
    ✅ "I trust Service B"

Step 5: Client Certificate (THE mTLS PART)
  Because Service B set requestCert: true,
  Service A sends:
    - service-a.crt (signed by mTLSDemoRootCA)
    - CertificateVerify (Service A signs a hash with its private key)

Step 6: Server Validates Client
  Service B performs:
    a) Extract the issuer from service-a.crt → "mTLSDemoRootCA"
    b) Find ca.crt in its trust store (https.createServer.ca = ca.crt)
    c) Verify the CA's digital signature on service-a.crt
    d) Check CertificateVerify → proves Service A holds the private key
    e) Because rejectUnauthorized: true → drop connection if any check fails
    ✅ "I trust Service A"

Step 7: Encrypted Communication
  Both sides derive the same session key → all HTTP traffic is encrypted

Step 8: Application-Level Identity Check
  In ProcessController: req.socket.getPeerCertificate().subject.CN === "service-a"
  This is an ADDITIONAL check — mTLS proved the cert is valid,
  but the app code decides WHICH valid identities are authorized.
```

### 5.5 The Two-Level Trust Model

This is a critical concept most tutorials miss:

```
Level 1: TLS Layer (Transport)
  "Is this certificate valid and signed by a trusted CA?"
  → Handled by Node.js https module automatically
  → Configured via: ca, requestCert, rejectUnauthorized

Level 2: Application Layer (Business Logic)
  "Is this SPECIFIC valid identity allowed to call THIS endpoint?"
  → Handled by YOUR code (ProcessService.findProRequest)
  → Checks: CN === 'service-a'
```

A certificate signed by your CA could have `CN=rogue-service`. It would pass Level 1 (valid signature), but fail Level 2 (CN check). Both levels are necessary for proper security.

---

## 6. Certificate File Formats (Reference)

| Extension | Format | Contains | Used For |
|---|---|---|---|
| `.key` | PEM | Private key | NEVER shared — proves ownership |
| `.csr` | PEM | Public key + desired identity | Sent to CA for signing |
| `.crt` / `.pem` | PEM (Base64) | Public key + identity + CA signature | Shared with peers |
| `.der` | DER (Binary) | Same as .crt but binary encoded | Java keystores, some systems |
| `.p12` / `.pfx` | PKCS#12 | Private key + certificate bundled | Import into browsers/keystores |

PEM format is human-readable:
```
-----BEGIN CERTIFICATE-----
MIIDazCCAlOgAwIBAgIUY... (Base64 encoded data)
-----END CERTIFICATE-----
```

---

## 7. Key Takeaways

1. **TLS encrypts the channel**; mTLS additionally proves **both** parties' identities.
2. The certificate chain of trust flows: **Root CA → signs → Service Certificate**.
3. Any party that holds the Root CA's public certificate can verify any service certificate signed by that CA.
4. The private key **never leaves the owner** — it is used only to create signatures and decrypt data locally.
5. mTLS authentication happens at the **transport layer** (before any HTTP headers or body are sent). This makes it fundamentally more secure than API keys or JWTs.
6. Application-level identity checks (verifying the CN) provide **authorization** on top of mTLS **authentication**.
