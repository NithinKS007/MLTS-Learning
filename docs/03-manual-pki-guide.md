# Manual PKI — Hands-On Certificate Generation

This guide walks you through generating all certificates manually with OpenSSL. By doing this yourself, you internalize the PKI concepts from the theory guide.

---

## Why Manual First?

In production you will never run these commands. But understanding what each flag does is essential because:
- You will need to **debug certificate issues** (expired certs, wrong CN, chain errors)
- You will need to **configure** tools like cert-manager, Vault, or Istio correctly
- Interview questions about mTLS expect you to understand the underlying PKI operations

---

## Prerequisites

- OpenSSL installed (`openssl version` to verify)
- A terminal in the project root directory

---

## Step 1: Create the Root Certificate Authority (CA)

The Root CA is the trust anchor. Every service certificate in this project is signed by this CA.

### 1.1 Generate the CA's Private Key

```bash
openssl genrsa -out certs/ca.key 4096
```

**What this does:**
- `genrsa`: Generate an RSA private key
- `-out certs/ca.key`: Save the private key to this file
- `4096`: Key length in bits (4096 for a CA — stronger because it signs everything)

**Security note**: This key must be **heavily guarded**. Anyone with `ca.key` can mint valid certificates for any service. In production, the CA key is stored in an HSM (Hardware Security Module).

### 1.2 Generate the CA's Self-Signed Certificate

```bash
openssl req -x509 -new -nodes -key certs/ca.key -sha256 -days 3650 -out certs/ca.crt \
  -subj "/C=US/ST=State/O=mTLSDemo/CN=mTLSDemoRootCA"
```

**What each flag does:**

| Flag | Purpose |
|---|---|
| `req -x509` | Create a certificate (not a CSR). `-x509` makes it self-signed. |
| `-new` | Generate a new certificate request |
| `-nodes` | No DES — don't encrypt the private key with a passphrase |
| `-key certs/ca.key` | Use this private key to sign the certificate |
| `-sha256` | Hash algorithm for the signature |
| `-days 3650` | Valid for 10 years (CAs have long lifetimes) |
| `-out certs/ca.crt` | Output file for the certificate |
| `-subj "..."` | Certificate subject (identity) |

**Subject breakdown:**
- `C=US` — Country
- `ST=State` — State/Province
- `O=mTLSDemo` — Organization
- `CN=mTLSDemoRootCA` — Common Name (the display name of this CA)

**Result:** `ca.crt` is the file you distribute to all services. It contains the CA's public key and is used to verify any certificate signed by this CA.

---

## Step 2: Generate Service B's Certificate (The Server)

### 2.1 Generate Service B's Private Key

```bash
openssl genrsa -out certs/service-b.key 2048
```

**Why 2048 here (not 4096)?** Service certs are rotated frequently (days to months), so 2048-bit keys are sufficient. The CA key is 4096 because it lives longer and signs many certs.

### 2.2 Create a Certificate Signing Request (CSR)

```bash
openssl req -new -key certs/service-b.key -out certs/service-b.csr \
  -subj "/C=US/ST=State/O=mTLSDemo/CN=service-b"
```

**What happens:**
1. OpenSSL takes Service B's private key
2. Extracts the corresponding public key
3. Bundles it with the identity `CN=service-b`
4. Outputs a CSR file (this is NOT a certificate yet)

**Critical:** `CN=service-b` is the identity that will appear in the signed certificate. This is what Service A's application code will check.

### 2.3 Sign the CSR with the CA

```bash
openssl x509 -req -in certs/service-b.csr \
  -CA certs/ca.crt -CAkey certs/ca.key -CAcreateserial \
  -out certs/service-b.crt -days 365 -sha256
```

| Flag | Purpose |
|---|---|
| `x509 -req` | Process a CSR and output a signed certificate |
| `-in service-b.csr` | The CSR to sign |
| `-CA ca.crt` | The CA certificate (contains the CA's public key and identity) |
| `-CAkey ca.key` | The CA's private key (used to create the digital signature) |
| `-CAcreateserial` | Auto-generate a serial number file for tracking |
| `-out service-b.crt` | The signed certificate output |
| `-days 365` | Valid for 1 year |

**Result:** `service-b.crt` is now signed by the CA. Any party holding `ca.crt` can verify it.

---

## Step 3: Generate Service A's Certificate (The Client)

Identical process, different identity:

```bash
# Private key
openssl genrsa -out certs/service-a.key 2048

# CSR
openssl req -new -key certs/service-a.key -out certs/service-a.csr \
  -subj "/C=US/ST=State/O=mTLSDemo/CN=service-a"

# Sign with CA
openssl x509 -req -in certs/service-a.csr \
  -CA certs/ca.crt -CAkey certs/ca.key -CAcreateserial \
  -out certs/service-a.crt -days 365 -sha256
```

---

## Step 4: Verify Your Certificates

### Inspect a certificate

```bash
openssl x509 -in certs/service-a.crt -text -noout
```

Look for:
- `Issuer: CN = mTLSDemoRootCA` — confirms who signed it
- `Subject: CN = service-a` — confirms the identity
- `Validity: Not Before / Not After` — expiry dates

### Verify chain of trust

```bash
openssl verify -CAfile certs/ca.crt certs/service-a.crt
# Expected: certs/service-a.crt: OK

openssl verify -CAfile certs/ca.crt certs/service-b.crt
# Expected: certs/service-b.crt: OK
```

This is exactly what Node.js does during the TLS handshake — it runs this verification automatically.

---

## Final File Layout

```
certs/
├── ca.key           # CA private key (GUARD THIS)
├── ca.crt           # CA certificate (distribute to all services)
├── service-a.key    # Service A private key (stays with Service A)
├── service-a.crt    # Service A certificate (presented during mTLS)
├── service-a.csr    # Service A CSR (can be deleted after signing)
├── service-b.key    # Service B private key (stays with Service B)
├── service-b.crt    # Service B certificate (presented during mTLS)
└── service-b.csr    # Service B CSR (can be deleted after signing)
```

---

## Production Note

In production, you **never** run these commands manually. See [04-production-pki.md](./04-production-pki.md) for what replaces this workflow. However, understanding every flag above is essential for debugging certificate issues, configuring infrastructure tooling, and answering technical interview questions.
