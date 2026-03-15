# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| v1 (current) | Yes |

This project is in active development. Security fixes are applied to the latest version on `main`.

---

## Reporting a Vulnerability

If you discover a security vulnerability, **do not open a public issue.**

Instead, email **jacob7choi@gmail.com** with:

1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if you have one)

You should receive an acknowledgment within 48 hours. Critical vulnerabilities will be prioritized and patched as quickly as possible.

---

## Security Model

Credential Vault is a blockchain-based identity and credential verification system. Security is enforced at the smart contract level -- the chain is the source of truth.

### On-Chain Enforcement

| Rule | How It's Enforced |
|------|-------------------|
| DID ownership | Only the DID controller can approve verification requests or manage keys |
| Issuer authorization | Only admin-registered issuers can issue credentials |
| Revocation control | Only the original issuer can revoke their credentials |
| Credential integrity | Credentials are immutable on-chain once issued |
| Verification consent | Three-step workflow (Request, Approval, Execution) requires explicit holder approval |
| Identity uniqueness | Reverse lookup enforces one address per active DID |
| Key compromise mitigation | Multi-key architecture allows revoking a compromised key without losing the identity |
| Identity recovery | Guardian threshold with 48-hour time-lock; controller can cancel during the window |
| Replay protection | On-chain nonce per DID for off-chain signature validation |
| Deactivated DID blocking | Credentials cannot be issued to or verified against deactivated identities |

### Smart Contract Security Practices

- All contracts use Solidity 0.8.19 (built-in overflow protection)
- OpenZeppelin v5.4.0 for battle-tested patterns (access control, reentrancy guards)
- Checks-effects-interactions pattern applied throughout
- Every state-changing function emits events for audit trail
- All public/external functions have explicit access control
- 260 tests covering happy paths, access control, edge cases, and 13 security bug fix regressions

### Backend API Security Practices

- JWT authentication with HS256 algorithm pinning, issuer/audience claim verification
- Token blacklist for logout -- revoked tokens are rejected immediately via SHA-256 hash lookup
- Fresh database role/org lookup on every request (prevents stale JWT privilege escalation)
- Zod schema validation on all request bodies
- Rate limiting on all public endpoints (configurable per-route)
- Request correlation IDs (UUID-validated) for audit trail
- HTTP request logging excludes query parameters to prevent sensitive data leakage
- Contract revert messages mapped to safe HTTP errors (no stack traces exposed)
- Parameterized SQLite queries throughout (no string concatenation)
- Strict positive integer validation on all route parameters
- Organization ownership enforcement on verification queries
- Pagination with capped limits (max 100) and offsets (max 10000) to prevent resource exhaustion

### Known Trust Assumptions

These are intentional design decisions, not vulnerabilities:

1. **Admin is trusted.** The deployer address controls issuer registration. This is a centralized trust anchor by design. Decentralized issuer governance is a future consideration.
2. **Guardian selection is the controller's responsibility.** The system enforces threshold and time-lock mechanics, but cannot prevent a user from choosing untrustworthy guardians.
3. **On-chain data is public.** Credential metadata stored on-chain is visible to anyone reading the blockchain. Do not store sensitive personal data directly in credential fields. Use hashes or off-chain storage references for sensitive content.
4. **Gas-based DoS.** An attacker with sufficient ETH could spam DID creation or verification requests. Rate limiting exists at the economic level (gas costs) but not at the contract level.
5. **Block timestamp dependency.** Guardian recovery time-locks use `block.timestamp`, which miners can manipulate by a few seconds. The 48-hour window makes this negligible in practice.
6. **Backend holds signing keys.** The backend API signs blockchain transactions on behalf of users. This is a centralized trust point -- compromise of the backend means compromise of all managed wallets. Production deployments must use HSMs or secure key management services. For v1 (local dev), Hardhat pre-funded accounts are used.

---

## Security Bug History

The following bugs were found and fixed during development. Regression tests exist for each one.

| Bug | Severity | Fix |
|-----|----------|-----|
| Guardian approving recovery for non-existent DID | High | Added `didExists` check |
| Guardian double-approval counting toward threshold | High | Added `hasApproved` tracking |
| Recovery executable before threshold met | Critical | Added threshold check in `executeRecovery` |
| Deactivated DID accepting new keys | Medium | Added `active` check in `addKey` |
| Controller transfer not cancelling pending recovery | High | `transferController` now cancels pending recovery |
| Recovery permanently disabled after first use | Medium | `initiateRecovery` now allows re-initiation after executed/cancelled |
| Credentials issuable to deactivated DIDs | High | `CredentialIssuer` checks `isDIDActive()` instead of `didExists()` |
| Verification requests against deactivated DIDs | High | `CredentialVerifier` checks `isDIDActive()` instead of `didExists()` |

See `blockchain/test/DIDRegistry.test.js` for the full set of regression tests.

---

## Audit Status

This project has **not been professionally audited**. It is currently in MVP/development stage and deployed only on local Hardhat networks.

**Do not use in production with real assets until a professional security audit is completed.**

A third-party audit is planned before any mainnet deployment. See `docs/ROADMAP.md` for the deployment timeline.

---

## Development Security Practices

- All contract changes require passing the full 260-test suite before merge
- Backend changes require passing 65 API tests before merge
- Integration tests (`FullWorkflow.test.js`) verify the complete three-contract workflow
- Backend integration tests verify full API-to-chain round trips
- No secrets, private keys, or credentials are committed to the repository
- Dependencies are pinned and auditable via lock files
- Frontend validates all contract return data before rendering

---

## Scope

The following are **in scope** for security reports:

- Smart contract vulnerabilities (reentrancy, access control bypass, state manipulation)
- Backend API vulnerabilities (authentication bypass, injection, privilege escalation)
- Frontend vulnerabilities (XSS, injection, wallet interaction bugs)
- Cryptographic issues (signature validation, nonce handling, JWT weaknesses)
- Logic bugs in the verification consent workflow
- Privacy leaks through on-chain data exposure or API response data

The following are **out of scope**:

- Vulnerabilities in dependencies (report these upstream)
- Issues that require compromising the Ethereum network itself
- Social engineering attacks against individual users
- Gas optimization suggestions (not security-relevant)
- Issues in the local Hardhat development environment only
