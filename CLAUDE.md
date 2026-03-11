# CLAUDE.md

This document provides guidelines for AI assistants working with this codebase. Following these conventions ensures consistency, maintainability, and alignment with the project's architectural principles.

---

## Style

- **Do not use emojis** in code, comments, commit messages, or responses
- **Never reference CLAUDE.md, Claude, Anthropic, or Claude Code** in committed code, docs, comments, docstrings, or commit messages. These are internal tools -- the codebase should stand on its own.
- **Never credit Claude in commit messages** -- no "Co-Authored-By: Claude" or similar. Commits should look like they were written by a human developer.

---

## Security-First Engineering

Security is the top priority in every decision. This is a credential verification system -- a compromise means forged degrees, stolen identities, and broken trust. Every line of code must be written with an adversarial mindset.

### Non-Negotiable Rules
- **Never commit secrets** -- no private keys, API keys, mnemonics, or credentials in code. Use environment variables and `.env` files (gitignored).
- **Never trust user input** -- validate and sanitize all inputs at system boundaries (API endpoints, frontend forms, contract function parameters).
- **Never use `tx.origin`** -- always use `msg.sender` for authentication in Solidity.
- **Never use floating point for financial calculations** -- Solidity uses uint256; frontend must handle BigInt correctly via viem/ethers.
- **Never expose stack traces or internal errors to users** -- log internally, return safe error messages.
- **Never disable security checks to make something work** -- fix the root cause.

### Smart Contract Security
- Use OpenZeppelin battle-tested contracts for all standard patterns (access control, reentrancy guards, pausability)
- Apply checks-effects-interactions pattern to prevent reentrancy
- Use `ReentrancyGuard` on any function that transfers value or makes external calls
- All public/external functions must have explicit access control (modifiers or require statements)
- Validate all parameters: check zero addresses, empty strings, array bounds, integer overflow
- Emit events for every state-changing operation (audit trail is mandatory)
- Mark functions as `view` or `pure` when they don't modify state
- Use `immutable` and `constant` for values that never change
- Consider front-running attacks on any function where transaction ordering matters
- Before deploying to mainnet: get a professional audit. No exceptions.

### Frontend Security
- Never store private keys or sensitive data in localStorage/sessionStorage
- Validate all contract return data before rendering (don't trust on-chain data blindly)
- Use Content Security Policy headers
- Sanitize any user-generated content before rendering to prevent XSS
- Validate transaction parameters client-side before sending to wallet
- Show users exactly what they are signing -- no blind signing
- Handle wallet disconnection and chain switching gracefully

### API Security (When Backend Is Implemented)
- Authenticate all endpoints (JWT or session-based)
- Rate limit all public endpoints
- Validate request bodies with schemas (Joi, Zod, or similar)
- Use parameterized queries -- never concatenate user input into queries
- Set appropriate CORS policies -- no wildcard in production
- Log all authentication failures and suspicious activity
- Use HTTPS everywhere -- no exceptions in production

### Dependency Security
- Audit dependencies before adding them (`npm audit`)
- Pin dependency versions in production deployments
- Never install packages from untrusted sources
- Keep OpenZeppelin contracts up to date for security patches
- Review lock files in PRs for unexpected changes

### Code Review Security Checklist
Before approving any PR, verify:
1. No secrets or credentials in the diff
2. All inputs validated at system boundaries
3. Access control on every state-changing function
4. Events emitted for audit trail
5. No reentrancy vulnerabilities
6. Error messages don't leak internal details
7. No new dependencies without justification

---

## Project Overview

**Credential Vault** is a blockchain-powered credential verification system that enables instant, cryptographically-verified proof of professional and academic achievements. Institutions issue tamper-proof credentials on-chain, and employers verify them in seconds instead of weeks.

The system consists of two implemented components:

1. **Blockchain Layer** - Three coordinated Solidity smart contracts for decentralized identity and credential management
2. **Frontend Application** - Next.js 15 Web3 dashboard with cyberpunk terminal UI

---

## Project Structure

```
credential_vault_v1/
├── blockchain/
│   ├── contracts/
│   │   ├── DIDRegistry.sol          # Decentralized identity management (v2)
│   │   ├── CredentialIssuer.sol     # Institution credential issuance
│   │   └── CredentialVerifier.sol   # Employer verification workflow
│   ├── test/
│   │   ├── DIDRegistry.test.js      # DID unit tests (162 tests)
│   │   ├── CredentialIssuer.test.js  # Issuer unit tests (55 tests)
│   │   ├── CredentialVerifier.test.js # Verifier unit tests (26 tests)
│   │   └── FullWorkflow.test.js     # End-to-end integration tests (5 tests)
│   ├── scripts/
│   │   ├── deploy.js               # Main deployment script
│   │   ├── setup-jacob.js          # Test data setup
│   │   └── update-jacob-credential.js
│   ├── deployments/                 # Auto-generated on deploy
│   ├── hardhat.config.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx             # Main dashboard
│   │   │   ├── layout.tsx           # Root layout
│   │   │   ├── providers.tsx        # Web3 providers (Wagmi + RainbowKit + React Query)
│   │   │   └── globals.css          # Cyberpunk terminal styling
│   │   └── hooks/
│   │       └── useContracts.ts      # Custom Wagmi hooks for all contract interactions
│   ├── config/
│   │   ├── wagmi.ts                 # Web3 chain/wallet configuration
│   │   └── contracts.json           # Contract addresses + ABIs (auto-generated)
│   ├── next.config.ts
│   ├── tsconfig.json
│   └── package.json
├── docs/
│   ├── adr/001-architecture-decisions.md
│   └── ROADMAP.md
├── CLAUDE.md                        # This file
└── README.md
```

---

## Instruction Precedence

When instructions conflict, follow this order:

1. **"Plan first"** -- Show plan, wait for approval before any code
2. **"Fix it"** -- Minimal safe fix, but still:
   - Write a failing test first (for bugs)
   - If touching >1 file, show 3-bullet plan first
3. **When in doubt** -- Ask, don't guess

---

## Working Style

### Plan Before Execute
- Before any multi-file change, show the plan first
- Don't write code until the approach is approved
- If something goes sideways, STOP -- go back to plan mode and re-plan

### Prove Your Work
- After completing a task, run tests to verify
- When asked to "prove it works", diff behavior and show evidence
- Commit after each completed phase with descriptive messages

### When Stuck
- Don't spin for more than 2 attempts on the same approach
- Ask for clarification instead of guessing
- Suggest 2-3 alternatives and let the user pick

### Use Subagents
- For complex refactors or exploration, use subagents to parallelize
- Keep main context clean -- offload individual tasks to subagents

---

## Prompting Patterns

| When I say... | Do this |
|---------------|---------|
| "Plan first" | Show detailed plan, wait for approval |
| "Grill me on these changes" | Review critically, block until concerns addressed |
| "Prove it works" | Diff behavior, run tests, show evidence |
| "Now do it elegantly" | Scrap the quick fix, implement the clean solution |
| "Use subagents" | Parallelize with multiple agents |
| "Fix it" | Just fix it (but follow precedence rules above) |

---

## Three-Contract Architecture

### Contract Dependency Flow

```
DIDRegistry (identity layer)
    ^                ^
    |                |
CredentialIssuer     CredentialVerifier
(issuance layer)     (verification layer)
                         |
                         v
                     CredentialIssuer (cross-reference for validation)
```

### DIDRegistry (`blockchain/contracts/DIDRegistry.sol`)
- Creates decentralized identities linked to wallet addresses (v2 with hardened security)
- Multi-key architecture: Authentication + Delegation key types, max 20 keys per DID
- Key rotation with history: `wasKeyValidAt()` for verifying old credentials signed with rotated keys
- Reverse lookup: one address = one active DID, prevents identity fragmentation
- Nonce-based replay protection for off-chain signatures
- Recovery guardians: 2-5 guardians, configurable threshold, 48-hour time-lock
- Key functions: `createDID()`, `getDIDDocument()`, `verifyDIDController()`, `addKey()`, `revokeKey()`, `transferController()`, `setupGuardians()`, `initiateRecovery()`, `approveRecovery()`, `executeRecovery()`, `cancelRecovery()`, `incrementNonce()`, `wasKeyValidAt()`, `resolveDID()`, `hasGuardianApproved()`
- Events: `DIDCreated`, `DIDUpdated`, `DIDDeactivated`, `DIDControllerTransferred`, `KeyAdded`, `KeyRevoked`, `NonceIncremented`, `GuardianAdded`, `GuardianRemoved`, `GuardianThresholdUpdated`, `RecoveryInitiated`, `RecoveryApproved`, `RecoveryExecuted`, `RecoveryCancelled`

### CredentialIssuer (`blockchain/contracts/CredentialIssuer.sol`)
- Admin registers authorized issuers (universities, certification bodies)
- Issuers mint tamper-proof credentials to DID holders
- Supports credential revocation and expiration
- Key functions: `registerIssuer()`, `issueCredential()`, `revokeCredential()`, `verifyCredential()`, `getHolderCredentials()`
- Events: `IssuerRegistered`, `CredentialIssued`, `CredentialRevoked`
- Modifiers: `onlyAdmin`, `onlyAuthorizedIssuer`

### CredentialVerifier (`blockchain/contracts/CredentialVerifier.sol`)
- Implements employer verification workflow: Request -> Approval -> Verification
- Cross-references DIDRegistry and CredentialIssuer for validation
- QR code quick-verify endpoint
- Key functions: `requestVerification()`, `approveVerification()`, `executeVerification()`, `quickVerify()`
- Events: `VerificationRequested`, `VerificationApproved`, `CredentialVerified`

### The Credential Flow (from FullWorkflow.test.js)
1. Student (Jacob) creates a DID via DIDRegistry
2. Admin registers university (Colby) as authorized issuer
3. Colby issues Jacob a CS degree credential
4. Employer (Google) requests verification
5. Jacob approves the verification request (DID ownership check)
6. System executes verification (cross-references all contracts)
7. Results stored on-chain with full audit trail
8. QR code quick-verify available

---

## Security Model (Enforced On-Chain)

| Rule | Implementation |
|------|----------------|
| DID ownership | Only DID controllers can approve verification requests |
| Issuer authorization | Only admin-registered issuers can issue credentials |
| Revocation control | Only the original issuer can revoke their credentials |
| Trust anchor | Admin controls issuer registration (centralized) |
| Credential integrity | Credentials are immutable on-chain once issued |
| Verification audit | All verification results stored on-chain |
| Key compromise | Multi-key architecture -- revoke compromised key, add new one |
| Identity recovery | Guardian threshold with 48-hour time-lock, controller can cancel |
| Replay protection | On-chain nonce per DID for off-chain signature validation |
| Identity uniqueness | Reverse lookup enforces one address = one active DID |

---

## Quality Gate

### Before Committing Contract Changes
```bash
cd blockchain && npx hardhat test
```
All tests must pass. No exceptions. The integration test (`FullWorkflow.test.js`) verifies the complete three-contract workflow.

### Before Committing Frontend Changes
```bash
cd frontend && npm run lint && npm run build
```

---

## Code Standards

### Solidity
- Solidity version: 0.8.19
- Optimizer: enabled, 200 runs
- OpenZeppelin v5.4.0 for security patterns
- Use modifiers for access control (`onlyAdmin`, `onlyAuthorizedIssuer`)
- Emit events for all state-changing operations
- Include NatSpec comments on public functions
- Gas costs matter -- document significant changes

### TypeScript / React (Frontend)
- Next.js 15 App Router with `"use client"` directives where needed
- React 19 with hooks pattern
- Wagmi v2 for contract reads/writes (`useReadContract`, `useWriteContract`)
- RainbowKit for wallet connection UI
- Tailwind CSS v4 for styling
- Strict TypeScript mode enabled
- Path aliases: `@/*` maps to `./src/*`
- No `any` unless absolutely necessary

### General
- No hardcoded values -- use config files
- No magic strings -- use constants or enums
- Comments explain **why**, not **what**
- Keep functions focused and single-responsibility

---

## Smart Contract Testing

### Test Framework
- Mocha + Chai with Hardhat (`@nomicfoundation/hardhat-toolbox`)
- Uses `ethers` from Hardhat for contract interaction
- `loadFixture` pattern for test isolation

### Test Files
```
blockchain/test/
├── DIDRegistry.test.js       # 162 tests -- DID lifecycle, keys, guardians, recovery, bug fix regressions
├── CredentialIssuer.test.js   # 55 tests -- issuance, revocation, admin transfer, access control
├── CredentialVerifier.test.js # 26 tests -- verification workflow, consent gate, quick verify
└── FullWorkflow.test.js      # 5 tests -- end-to-end integration (Jacob -> Colby -> Google scenario)
```

### Test Pattern
```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ContractName", function () {
  async function deployFixture() {
    const [admin, user1, user2] = await ethers.getSigners();
    const Contract = await ethers.getContractFactory("ContractName");
    const contract = await Contract.deploy(/* constructor args */);
    return { contract, admin, user1, user2 };
  }

  it("should do something", async function () {
    const { contract, user1 } = await loadFixture(deployFixture);
    await contract.connect(user1).someFunction();
    expect(await contract.getValue()).to.equal(expected);
  });
});
```

### What to Test
- Happy path for all public functions
- Access control (unauthorized callers should revert)
- Edge cases (empty inputs, boundary values, duplicate operations)
- Event emissions
- Cross-contract interactions (verification flow)
- Gas usage for new features (document if significant)

---

## Frontend Hooks (`frontend/src/hooks/useContracts.ts`)

Custom Wagmi hooks wrapping all contract interactions:

| Hook | Type | Purpose |
|------|------|---------|
| `useHasDID()` | Read | Check if connected wallet has a DID |
| `useGetDID()` | Read | Fetch DID document for address |
| `useCreateDID()` | Write | Create new DID |
| `useGetCredentials()` | Read | Get all credentials for a DID holder |
| `useGetCredential()` | Read | Get single credential by ID |
| `useIssueCredential()` | Write | Issue new credential (issuer only) |
| `useRegisterIssuer()` | Write | Register authorized issuer (admin only) |
| `useIsAuthorizedIssuer()` | Read | Check if address is authorized issuer |
| `useQuickVerify()` | Read | Quick credential verification (QR code) |

All hooks pull contract addresses and ABIs from `frontend/config/contracts.json` (auto-generated by deploy script).

---

## Deployment Pipeline

The deployment script (`blockchain/scripts/deploy.js`) handles everything:

```bash
# 1. Start local node (separate terminal)
cd blockchain && npx hardhat node

# 2. Deploy all contracts
npm run deploy:local
```

**Auto-generated artifacts:**
- `blockchain/deployments/localhost.json` -- contract addresses + deployer info
- `blockchain/deployments/abis/` -- extracted ABIs per contract
- `blockchain/deployments/frontend-config.json` -- addresses + ABIs bundled
- `frontend/config/contracts.json` -- copy for frontend consumption

Contract addresses are deterministic on local Hardhat:
- DIDRegistry: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- CredentialIssuer: `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`
- CredentialVerifier: `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`

---

## Network Configuration

| Network | Chain ID | RPC | Purpose |
|---------|----------|-----|---------|
| Hardhat Local | 1337 | http://127.0.0.1:8545 | Development |
| Sepolia | 11155111 | (needs RPC URL) | Testnet |
| Ethereum Mainnet | 1 | (needs RPC URL) | Production |
| Polygon | 137 | (needs RPC URL) | L2 production |

Wagmi config: `frontend/config/wagmi.ts`
Hardhat config: `blockchain/hardhat.config.js`

---

## Gas Costs (Approximate)

| Operation | Gas | Notes |
|-----------|-----|-------|
| createDID | ~277k | One-time per wallet (includes first auth key + reverse lookup) |
| issueCredential | ~294k | Per credential |
| Verification workflow | ~289k | Request + approve + execute |
| addKey | ~109k | Per key addition |
| revokeKey | ~65k | Per key revocation |
| transferController | ~176k | Includes key rotation + reverse lookup update |
| setupGuardians | ~189k | Initial guardian configuration |
| Full recovery | ~413k | Initiate + approve + execute |
| incrementNonce | ~51k | Per nonce increment |

Document gas impact when adding new contract features.

---

## Commands

### Blockchain
```bash
cd blockchain

npm install                                    # Install dependencies
npm test                                       # Run full test suite
npx hardhat test test/FullWorkflow.test.js     # Run specific test
npm run node                                   # Start local Hardhat node
npm run compile                                # Compile contracts
npm run deploy:local                           # Deploy to local network
```

### Frontend
```bash
cd frontend

npm install          # Install dependencies
npm run dev          # Dev server with Turbopack (localhost:3000)
npm run build        # Production build
npm start            # Start production server
npm run lint         # ESLint
```

### Full Local Stack
```bash
# Terminal 1: Start blockchain
cd blockchain && npx hardhat node

# Terminal 2: Deploy contracts
cd blockchain && npm run deploy:local

# Terminal 3: Start frontend
cd frontend && npm run dev

# Connect wallet to localhost:8545 (chainId 1337)
```

---

## Known Limitations

These are intentional trade-offs, not oversights. See `docs/ROADMAP.md` for planned solutions.

| Limitation | Notes |
|------------|-------|
| No backend API | All interactions are direct Web3 calls. REST API needed for non-Web3 consumers. |
| No CI/CD | Quality gate is `npx hardhat test` locally. GitHub Actions planned. |
| No off-chain storage | All data on-chain. IPFS or similar needed for credential metadata at scale. |
| WalletConnect projectId | Placeholder string. Needs real project ID for production. |
| Frontend is read-heavy | Displays on-chain data but write flows (DID creation, verification approval) are minimal. |
| MAX_KEYS counts revoked | 20 total key slots including revoked (kept for history). Users must manage key count. |
| Local network only | Not deployed to testnet or mainnet yet. |

---

## Common Workflows

### Adding a New Contract Feature
1. Modify contract in `blockchain/contracts/`
2. Add/update tests in `blockchain/test/`
3. Run `npx hardhat test` to verify
4. Update integration test if workflow changes
5. Document gas impact if significant
6. Redeploy: `npm run deploy:local` (updates frontend config automatically)

### Adding a New Frontend Feature
1. Add contract hook in `frontend/src/hooks/useContracts.ts` if needed
2. Implement UI in `frontend/src/app/page.tsx` or new route
3. Use existing Wagmi patterns (useReadContract/useWriteContract)
4. Run `npm run lint && npm run build` to verify

### Understanding the System
Read `blockchain/test/FullWorkflow.test.js` -- it's the best documentation of how all three contracts work together. The test includes console.log statements explaining each step.

---

## Bug Workflow

When a bug is reported:

1. **DON'T** start by trying to fix it
2. First, write a test that reproduces the bug
3. Then fix the code
4. Prove the fix with a passing test
5. Update CLAUDE.md if this bug class should be prevented in future

---

## Mistake Learning

After every correction:
- Ask: "What rule would have prevented this?"
- Add that rule to the appropriate section of this file
- Goal: mistake rate drops over time as CLAUDE.md improves

---

## Dependencies

### Blockchain
- `hardhat` ^2.26.3 -- Ethereum development environment
- `@nomicfoundation/hardhat-toolbox` ^6.1.0 -- Testing, compilation, deployment
- `@openzeppelin/contracts` ^5.4.0 -- Security patterns and utilities

### Frontend
- `next` 15.5.4 -- React framework (App Router)
- `react` ^19.2.0 -- UI library
- `wagmi` ^2.18.0 -- React hooks for Ethereum
- `@rainbow-me/rainbowkit` ^2.2.8 -- Wallet connection UI
- `@tanstack/react-query` ^5.90.2 -- Async state management
- `viem` ^2.38.0 -- TypeScript Ethereum library (wagmi dependency)
- `ethers` ^6.15.0 -- Ethereum utilities
- `framer-motion` ^12.23.22 -- Animations
- `react-hot-toast` ^2.6.0 -- Notifications
- `lucide-react` ^0.545.0 -- Icons
- `tailwindcss` ^4.1.14 -- Utility-first CSS

---

## Quick Reference

### Patterns to Follow
- Wagmi hooks for all contract interactions (never raw ethers in components)
- `loadFixture` pattern for test isolation in Hardhat tests
- Events emitted for every state change on-chain
- Access control via modifiers on contract functions
- Auto-generated frontend config from deploy script
- Early returns over deep nesting

### Patterns to Avoid
- Direct ethers.js calls in React components (use custom hooks)
- Hardcoded contract addresses (use contracts.json)
- Skipping tests before committing contract changes
- God components (break into smaller pieces)
- Catching generic errors without re-raising or logging
- Manual ABI management (deploy script handles it)

---

## Important File Paths

| File | Purpose |
|------|---------|
| `blockchain/contracts/*.sol` | Smart contracts (source of truth) |
| `blockchain/test/FullWorkflow.test.js` | Best docs for how contracts interact |
| `blockchain/test/DIDRegistry.test.js` | Most comprehensive test file (162 tests) |
| `blockchain/scripts/deploy.js` | Deployment + artifact generation |
| `frontend/src/app/page.tsx` | Main dashboard UI |
| `frontend/src/hooks/useContracts.ts` | All contract interaction hooks |
| `frontend/config/contracts.json` | Contract config (auto-generated) |
| `frontend/config/wagmi.ts` | Web3 chain/wallet setup |
| `docs/adr/001-architecture-decisions.md` | Architecture decision records |
| `docs/ROADMAP.md` | Future work and priorities |
