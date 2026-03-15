# ADR-001: Architecture Decisions

## Status
Accepted

---

## 1. Three-Contract Architecture

### Context
The system requires on-chain logic for identity management, credential issuance, and credential verification. A monolithic contract would consolidate all functionality but raises concerns around gas costs, the 24KB EIP-170 size limit, and the blast radius of any upgrade or bug fix.

### Decision
Split the system into three coordinated contracts, each with a single responsibility:

1. **DIDRegistry** -- Manages decentralized identities. Maps wallet addresses to DID documents and verifies ownership.
2. **CredentialIssuer** -- Handles institution onboarding and credential lifecycle. Authorized issuers create, manage, and revoke credentials tied to DIDs.
3. **CredentialVerifier** -- Implements the employer verification workflow (Request, Approval, Verification) and cross-references the other two contracts.

Communication flows downward: CredentialVerifier references both DIDRegistry and CredentialIssuer. CredentialIssuer references DIDRegistry for existence checks.

### Consequences
- Each contract stays under the 24KB size limit with room for growth.
- Contracts can be upgraded or replaced independently.
- Cross-contract calls add gas overhead compared to internal calls.
- Deployment requires correct ordering and address wiring (automated by the deploy script).

---

## 2. DID-Based Identity

### Context
The simplest approach would be to use raw wallet addresses as identities. However, addresses carry no semantic meaning, cannot be extended with metadata, and tie identity to a single key pair. A compromised key means a compromised identity with no recovery path.

### Decision
Adopt Decentralized Identifiers (DIDs) as the identity layer, implemented through DIDRegistry. Each DID is a distinct, self-sovereign identity record linked to a controlling wallet address. Credentials reference DIDs rather than addresses, decoupling credential validity from any single key pair.

Key design choices:
- Conceptual alignment with the W3C DID specification for future interoperability.
- Each address controls exactly one active DID (enforced via reverse lookup).
- DID documents store metadata without bloating credential contracts.

### Consequences
- Credentials remain valid even if the underlying key is rotated or the controller address changes.
- Users control their own identity records (self-sovereign identity).
- Adds a registration step before users can receive credentials.

---

## 3. DIDRegistry v2: Identity Hardening

### Context
The initial DIDRegistry used a single public key string and a single controller address with no recovery mechanism. Losing a wallet meant losing the identity permanently. A compromised key had no rotation path. This is unacceptable for a system people trust with their real credentials.

### Decision
Upgrade DIDRegistry with five features that make identity robust enough for production use:

**Multi-key architecture.** Replace the single public key with typed key slots (Authentication, Delegation). Each key has an address, type, active status, and timestamps. Keys can be added and revoked independently, so compromising one key does not compromise the entire identity. Maximum 20 keys per DID.

**Key rotation with history.** When a key is revoked, the old key is stored with a `revokedAt` timestamp rather than deleted. This allows anyone to verify "was this key valid at time X?" -- critical for validating old credentials that were signed with a previous key.

**Reverse lookup.** An `address -> DID` mapping enforces that one address can only control one active DID, preventing identity fragmentation. Also enables resolving a wallet address to its associated DID without knowing the DID string.

**Controller transfer with key rotation.** When the controller is transferred, the old controller's authentication key is automatically revoked and a new one is added for the new controller. The reverse lookup is updated atomically.

**Deactivation with full cleanup.** When a DID is deactivated, all active keys are revoked and the reverse lookup is cleared, ensuring no dangling references.

**Nonce-based replay protection.** Each DID has an on-chain nonce that the controller can increment. Off-chain signatures include the current nonce, and verifiers check it against the on-chain value. This prevents replay attacks where a valid signature is resubmitted after the signer intended it to expire.

**Recovery guardians.** The controller designates 2-5 trusted addresses as guardians and sets a threshold (minimum 2). If the controller loses access to their wallet, guardians can collectively initiate a recovery to transfer control to a new address. Recovery follows a strict flow: a guardian initiates the request, other guardians approve until the threshold is met, a 48-hour time-lock must pass, then any guardian can execute. The current controller can cancel a pending recovery at any time during the time-lock -- this is the defense against malicious or compromised guardians. Only one recovery can be active at a time. Guardians can be added, removed, and the threshold updated by the controller while they still have access.

### Consequences
- Identity survives key rotation and controller transfer.
- Key history enables backward-compatible credential verification.
- Reverse lookup prevents identity fragmentation and enables address-based resolution.
- `createDID` signature changed (dropped `publicKey` parameter; controller is auto-added as first auth key).
- Gas costs for `createDID` increase from ~183k to ~277k due to key storage and reverse lookup writes.
- Recovery adds a social trust layer: security depends on guardian selection, not just key management.
- The 48-hour time-lock balances recovery speed against the controller's ability to detect and cancel malicious attempts.
- Nonce management is the controller's responsibility; forgetting to increment after signing creates a replay window.
- Backward compatible: `didExists`, `verifyDIDController`, and `getDIDDocument` interfaces preserved for CredentialIssuer and CredentialVerifier.

---

## 4. Verification Consent Workflow

### Context
A naive implementation would allow anyone to query credentials for any DID at any time. This creates privacy concerns: candidates would have no control over who accesses their credential data. In GDPR jurisdictions, accessing personal data without consent carries legal risk.

### Decision
Implement a three-step consent-gated verification workflow:

1. **Request** -- The verifier creates an on-chain request specifying the candidate's DID and credentials to verify.
2. **Approval** -- The candidate (DID controller) explicitly approves the request on-chain.
3. **Verification** -- The system cross-references DIDRegistry and CredentialIssuer, recording results on-chain.

No credential data is disclosed until the candidate gives explicit, on-chain consent. Only the requesting employer can execute the verification after approval.

A separate `quickVerify` endpoint exists for QR code scenarios where the candidate has already consented by sharing the credential ID.

### Consequences
- Candidates retain full control over who verifies their credentials.
- Aligns with GDPR principles of data minimization and purpose limitation.
- On-chain audit trail provides non-repudiable evidence of consent.
- Adds latency: verifiers must wait for candidate approval.
- Each step incurs gas costs, making verification more expensive than a single lookup.

---

## 5. Two-Step Admin Transfer

### Context
The CredentialIssuer has an admin role controlling issuer authorization. A single-step transfer provides no safety net: a typo in the target address means permanent loss of admin control over the entire issuer system.

### Decision
Implement two-step admin transfer, modeled after OpenZeppelin's Ownable2Step:

1. Current admin calls `transferAdmin(newAddress)` to nominate.
2. Nominated address calls `acceptAdmin()` to confirm.

If the nominated address is wrong or inaccessible, the accept transaction never occurs and the original admin retains control.

### Consequences
- Eliminates irreversible admin loss from address typos.
- The accepting party cryptographically proves they control the target address.
- Requires two transactions and coordination between two parties.

---

## 6. Cross-Contract DID Validation

### Context
If CredentialIssuer does not validate that a DID exists before creating a credential, orphan credentials can be produced -- credentials tied to DIDs that were never registered. Orphan credentials waste gas, pollute storage, and create confusion during verification.

### Decision
CredentialIssuer and CredentialVerifier hold a reference to DIDRegistry and validate DID status before allowing operations. Both contracts use `isDIDActive()` (not `didExists()`) to gate their actions. If the DID does not exist or has been deactivated, the transaction reverts.

This distinction is critical: `didExists()` returns true even for deactivated DIDs (the mapping is never cleared), while `isDIDActive()` checks both existence and active status. Using `didExists()` alone allowed credentials to be issued to deactivated identities -- a security bug that was found and fixed.

### Consequences
- Prevents orphan credentials and blocks operations against deactivated identities.
- Simplifies verification: CredentialVerifier can trust that credentials reference valid, active DIDs.
- Adds ~2,600 gas overhead per issuance for the cross-contract read.
- Creates a runtime dependency on DIDRegistry availability.
