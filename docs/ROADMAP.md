# Roadmap

World-class B2B provider credentialing platform. Built on blockchain for tamper-proof identity and credential verification, designed for healthcare organizations that need to verify provider credentials in seconds instead of weeks.

---

## Done

- Three-contract architecture (DIDRegistry, CredentialIssuer, CredentialVerifier)
- DIDRegistry v2: multi-key, key rotation history, reverse lookup, nonces, guardian recovery
- Consent-gated verification workflow (Request, Approval, Verification)
- Two-step admin transfer for issuer management
- 260 tests with 13 security bug fix regressions
- Next.js 15 frontend with Web3 wallet integration
- Local development environment with automated deployment
- CI/CD pipeline with GitHub Actions (contracts, frontend, security audit)

---

## Phase 1: Foundation Fixes

The core value prop -- credential verification -- must be visible and demoable before anything else.

**Fix frontend git submodule and contracts.json tracking**
The frontend has a tracking issue with the contracts configuration file that blocks clean builds. Fix this so the local stack works end-to-end without manual intervention.

**End-to-end local stack testing**
Connect wallet, create DID, issue credential, verify -- through the actual UI, not just tests. Every step of the credential lifecycle must work in the browser against a local Hardhat node.

**Build verification request/approve/execute UI**
The frontend is read-heavy. Add the write flows: verification request submission, holder approval, and execution with result display. This is the core product -- an employer or hospital must be able to request and receive verification through the dashboard.

---

## Phase 2: Network Deployment

Prove the system works beyond localhost with real gas and real block times.

**Deploy to Sepolia or Polygon Amoy testnet**
Configure RPC provider (Alchemy or Infura), fund deployer wallet with testnet ETH, deploy all three contracts, and update frontend to connect to the live testnet. This validates that the system works under real network conditions -- block confirmation delays, gas estimation, transaction failures.

---

## Phase 3: Backend API

Non-Web3 consumers (hospitals, HR systems, state boards) need REST endpoints, not MetaMask.

**REST API layer for system integration**
Credential lookup by provider ID, verification status polling, and webhook notifications when verification completes. This is what makes the platform usable for enterprise clients who will never install a browser wallet.

**Authentication and access control**
JWT-based auth for API consumers. Rate limiting on all public endpoints. Schema validation on request bodies. CORS policies locked to registered domains.

---

## Phase 4: Provider Credentialing Features

Transform the generic credential system into a purpose-built provider credentialing platform.

**Medical credential schemas**
Typed credential structures for medical license, board certification, DEA registration, malpractice insurance, and residency completion. Each schema enforces required fields (license number, issuing state, expiration date, specialty) so credentials are machine-readable and queryable.

**Multi-issuer onboarding**
State medical boards, ABMS, universities, and insurance carriers register as authorized issuers through a structured onboarding flow. Each issuer type has defined permissions -- a state board can issue medical licenses but not board certifications.

**Provider portal**
Doctors and nurses manage their DID and credentials in one place. View all active credentials, track expiration dates, approve or deny verification requests, and see who has verified their credentials.

**Verification dashboard**
Hospitals and health systems request verifications, track status, and view results. Bulk verification for onboarding multiple providers. Alerts when a provider's credential expires or gets revoked.

**Expiration enforcement and real-time license status**
Credentials with expiration dates automatically become invalid after expiry. Issuers can update license status (suspended, restricted, revoked) and the change propagates to all pending and future verifications immediately.

---

## Phase 5: Standards and Compliance

Interoperability and regulatory alignment for enterprise adoption.

**W3C DID spec compliance**
Align DID document structure with the W3C Decentralized Identifiers specification. Enables interoperability with other DID systems and credential networks.

**W3C Verifiable Credentials data model**
Structure credentials according to the W3C VC data model so they can be recognized and verified by any compliant system, not just this platform.

**Off-chain encrypted storage**
Store credential metadata (scanned documents, attestation details) on IPFS or an encrypted database. Keep only integrity hashes on-chain. Reduces gas costs and enables storage of data that should not be fully public.

**HIPAA-aligned consent management**
Granular consent controls: provider A allows hospital B to see credential type C for time period D. Consent is auditable on-chain and revocable at any time. Required for any healthcare deployment.

**Formal verification of critical contract functions**
Mathematically prove correctness of access control, consent gating, and credential lifecycle functions. Eliminates entire classes of bugs in the code that protects provider identities.

---

## Later

Features that require significant infrastructure or make sense at scale.

- **Zero-knowledge proofs** -- Prove credential properties without revealing details (e.g., "board certified in cardiology" without disclosing license number). Requires ZK circuit development.
- **Multi-chain deployment** -- Deploy to L2s (Polygon, Arbitrum, Base) for lower transaction costs. Same contracts, different networks.
- **Mobile wallet app** -- Providers manage DIDs and approve verifications from their phone. Push notifications for verification requests.
- **Enterprise integrations** -- Connect to Workday, BambooHR, Greenhouse, and healthcare-specific systems (Cactus, Modio) for automated credential ingestion and status sync.
- **AI-powered fraud detection** -- ML models trained on verification patterns to flag anomalies. Requires real usage data first.

---

## Not Planned

- **Quantum-resistant cryptography** -- Ethereum itself is not quantum-resistant. Solving this at the application layer is premature.
- **Custom L1/L2** -- Building a dedicated chain adds massive complexity with no clear benefit over deploying to existing networks.
- **Token/tokenomics** -- This is infrastructure, not a DeFi protocol. Adding a token would complicate adoption without improving the product.
