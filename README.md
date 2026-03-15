# Credential Vault

Blockchain-based identity and credential verification platform for healthcare provider credentialing. Primary sources (medical schools, state boards, certification bodies) issue verifiable credentials on-chain, and requesting organizations (hospitals, health systems) verify providers in seconds instead of months.

Built on Ethereum with three coordinated smart contracts: identity management, credential issuance, and consent-gated verification. REST API backend abstracts blockchain complexity for non-Web3 consumers (hospitals, CVOs, HR systems). B2B model -- no PHI or PII stored on-chain.

## Architecture

```
DIDRegistry (identity layer)
    ^                ^
    |                |
 CredentialIssuer     CredentialVerifier
(issuance layer)     (verification layer)
                         |
                         v
                     CredentialIssuer (cross-reference)
```

**DIDRegistry** -- Decentralized identity management with multi-key architecture, key rotation history, reverse lookups, nonce-based replay protection, and social recovery via guardian threshold.

**CredentialIssuer** -- Institution onboarding and credential lifecycle. Admin registers authorized issuers, issuers mint credentials to DID holders, supports revocation and expiration. Two-step admin transfer for safety.

**CredentialVerifier** -- Three-step consent-gated verification workflow (Request, Approval, Verification). No credential data is disclosed until the holder gives explicit on-chain consent. Quick-verify endpoint for QR code scenarios.

## DIDRegistry v2 Security Features

The identity layer is hardened for production use:

- **Multi-key architecture** -- Authentication and Delegation key types, max 20 keys per DID. Compromising one key does not compromise the identity.
- **Key rotation with history** -- Revoked keys are preserved with timestamps. `wasKeyValidAt()` answers "was this key valid at time X?" for verifying old credentials.
- **Reverse lookup** -- One address controls exactly one active DID. Prevents identity fragmentation, enables address-based resolution.
- **Nonce-based replay protection** -- On-chain nonce per DID for off-chain signature validation.
- **Recovery guardians** -- 2-5 trusted addresses with configurable threshold. 48-hour time-lock on recovery execution. Controller can cancel during the window. Guardians are removed from the set if they become the new controller.
- **Deactivated DID blocking** -- `isDIDActive()` gates credential issuance and verification. Dead identities cannot be used.

## Project Structure

```
credential_vault_v1/
  blockchain/
    contracts/
      DIDRegistry.sol          # Identity management (v2)
      CredentialIssuer.sol     # Credential issuance
      CredentialVerifier.sol   # Verification workflow
    test/
      DIDRegistry.test.js      # 139 tests
      CredentialIssuer.test.js  # 60 tests
      CredentialVerifier.test.js # 56 tests
      FullWorkflow.test.js     # 5 integration tests
    scripts/
      deploy.js                # Deployment + artifact generation
    slither.config.json        # Slither static analysis config
    hardhat.config.js
    package.json
  backend/
    src/
      index.ts                 # Express app entry point
      config.ts                # Env config, contract loading
      db/                      # SQLite database + schema
      chain/                   # ethers.js provider, contracts, signers
      middleware/              # Auth, validation, rate limiting, error handling
      routes/                  # Auth, DID, credential, verification, admin routes
      services/                # Business logic for each domain
      types/                   # Shared TypeScript types
    test/
      auth.test.ts             # 20 tests
      did.test.ts              # 8 tests
      credential.test.ts       # 14 tests
      verification.test.ts     # 21 tests
      integration.test.ts      # 10 tests (requires Hardhat node)
    package.json
    tsconfig.json
  frontend/
    src/
      app/                     # Next.js 15 App Router
      hooks/useContracts.ts    # Wagmi hooks for all contract interactions
    config/
      wagmi.ts                 # Web3 chain/wallet config
      contracts.json           # Auto-generated contract addresses + ABIs
  docs/
    adr/
      001-architecture-decisions.md
      002-provider-credentialing-vertical.md
    ROADMAP.md
  .github/workflows/ci.yml    # CI/CD pipeline
  SECURITY.md                  # Security policy and disclosure
  LICENSE
  README.md
```

## Quick Start

```bash
# Terminal 1: Start local blockchain
cd blockchain
npm install
npx hardhat node

# Terminal 2: Deploy contracts
cd blockchain
npm run deploy:local

# Terminal 3: Start backend API
cd backend
npm install
npm run dev

# Terminal 4: Start frontend (optional -- for Web3 dashboard)
cd frontend
npm install
npm run dev
```

The backend API runs on `http://localhost:3000/api`. For the frontend, connect your wallet to `localhost:8545` (Chain ID 1337).

## Running Tests

```bash
# Smart contract tests (260 tests)
cd blockchain && npx hardhat test

# Backend API tests (65 tests, 10 require Hardhat node)
cd backend && npm test

# Backend integration tests (requires running Hardhat node + deployed contracts)
cd backend && TEST_WITH_CHAIN=true npx vitest run test/integration.test.ts
```

## CI/CD

GitHub Actions pipeline runs on every push and PR to `main` with four parallel jobs:

- **Smart Contracts** -- compile, full test suite with gas reporting
- **Backend API** -- type check, unit test suite (65 tests)
- **Frontend** -- lint, type check, production build
- **Security Audit** -- npm audit on all packages, Slither static analysis on Solidity

## The Credential Flow

1. Provider (doctor) creates a DID via DIDRegistry
2. Admin registers a primary source (medical school, state board) as an authorized issuer
3. Primary source issues a credential to the provider's DID (degree, license, board cert)
4. Requesting organization (hospital) requests verification, specifying the credential IDs
5. Provider approves the request on-chain (consent gate)
6. Organization executes verification (cross-references all contracts)
7. Results stored on-chain with full audit trail

See `blockchain/test/FullWorkflow.test.js` for the complete flow in code.

## Security Model

| Rule | Enforcement |
|------|-------------|
| DID ownership | Only controllers can approve verification requests |
| Issuer authorization | Only admin-registered issuers can issue credentials |
| Revocation control | Only the original issuer can revoke their credentials |
| Credential integrity | Credentials are immutable on-chain once issued |
| Verification consent | Three-step workflow requires explicit holder approval |
| Key compromise recovery | Guardian threshold with 48-hour time-lock |
| Replay protection | On-chain nonce per DID for off-chain signatures |
| Deactivated DID blocking | `isDIDActive()` gates issuance and verification |
| No PHI/PII on-chain | Sensitive data stored off-chain; only hashes and identifiers on-chain |

## Gas Costs

| Operation | Gas |
|-----------|-----|
| createDID | ~277k |
| issueCredential | ~294k |
| Verification workflow (request + approve + execute) | ~289k |
| addKey | ~109k |
| setupGuardians | ~189k |
| Full recovery (initiate + approve + execute) | ~413k |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart contracts | Solidity 0.8.19, Hardhat, OpenZeppelin v5.4 |
| Backend API | Express.js, TypeScript, ethers.js v6 |
| Database | SQLite (better-sqlite3) |
| Auth | JWT (HS256) + bcrypt |
| Validation | Zod |
| Frontend | Next.js 15, React 19, TypeScript |
| Web3 | Wagmi v2, viem, RainbowKit |
| Styling | Tailwind CSS v4 |
| Testing | Mocha/Chai (contracts), Vitest/Supertest (backend) |
| CI/CD | GitHub Actions, Slither |

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased plan: foundation fixes, testnet deployment, provider credentialing features, and standards/compliance (W3C DID/VC, HIPAA alignment).

## Security

See [SECURITY.md](SECURITY.md) for the security policy, responsible disclosure process, and bug history.

## License

MIT
