# Roadmap

What's built, what's next, and what's on the horizon.

---

## Done

- Three-contract architecture (DIDRegistry, CredentialIssuer, CredentialVerifier)
- DIDRegistry v2: multi-key, key rotation history, reverse lookup, nonces, guardian recovery
- Consent-gated verification workflow (Request, Approval, Verification)
- Two-step admin transfer for issuer management
- 260 tests with 13 security bug fix regressions
- Next.js 15 frontend with Web3 wallet integration
- Local development environment with automated deployment

---

## Next

Things that make sense to build soon, in rough priority order.

**Testnet deployment**
Deploy to Sepolia or Polygon Amoy. Prove the system works beyond localhost. Requires RPC provider setup (Alchemy/Infura) and testnet ETH.

**Backend API**
REST API layer for system integration. Enables credential lookup, verification status polling, and webhook notifications without requiring every consumer to interact with the blockchain directly.

**CI/CD pipeline**
GitHub Actions workflow that runs the test suite on push. Block merges on failure. Simple to set up, prevents regressions.

**Frontend credential management**
The frontend currently reads on-chain data. Needs write flows: DID creation form, credential display with verification status, verification request approval UI.

**QR code verification**
Generate QR codes containing credential IDs. Scan to trigger `quickVerify`. Natural UX for in-person verification (career fairs, interviews).

---

## Later

Features that require more infrastructure or make sense at scale.

**Off-chain metadata storage**
Store credential details (transcripts, certificates) on IPFS or similar. Keep only hashes on-chain. Reduces gas costs significantly for data-heavy credentials.

**Mobile wallet app**
React Native or Flutter app for managing DIDs and credentials. Push notifications for verification requests. QR code scanner built in.

**Zero-knowledge proofs**
Prove credential properties without revealing the credential itself. Example: "I have a degree from an accredited university" without disclosing which one. Requires ZK circuit development (circom/noir).

**Multi-chain deployment**
Deploy to Polygon, Arbitrum, or Base for lower transaction costs. Same contracts, different networks. Requires bridge strategy for cross-chain credential recognition.

**AI-powered fraud detection**
ML models trained on verification patterns to flag anomalies. Requires real usage data first -- premature to build now. Could detect suspicious bulk verification requests, unusual issuer behavior, or credential farming.

**Enterprise integrations**
HR system APIs (Workday, BambooHR, Greenhouse). Bulk verification endpoints. SSO integration for institutional issuers.

---

## Not Planned

Things that sound cool but don't make sense for this project.

- **Quantum-resistant cryptography** -- Ethereum itself isn't quantum-resistant. Solving this at the application layer is premature.
- **Custom L1/L2** -- Building a dedicated chain adds massive complexity with no clear benefit over deploying to existing networks.
- **Token/tokenomics** -- This is an infrastructure tool, not a DeFi protocol. Adding a token would complicate adoption without improving the product.
