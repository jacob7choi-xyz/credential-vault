# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Credential Vault is a blockchain-powered credential verification system that enables instant, cryptographically-verified proof of professional and academic achievements. The system consists of three main components:

1. **Blockchain Layer** - Smart contracts for decentralized identity and credential management
2. **Frontend Application** - Next.js 15 Web3 dashboard for credential management
3. **Backend API** - REST API for system integration (skeletal structure in place)

## Architecture

### Three-Contract System

The blockchain layer implements a coordinated three-contract architecture:

1. **DIDRegistry** (`blockchain/contracts/DIDRegistry.sol`)
   - Manages decentralized identities (DIDs)
   - Links wallet addresses to DID documents
   - Verifies DID ownership

2. **CredentialIssuer** (`blockchain/contracts/CredentialIssuer.sol`)
   - Institution credential issuance system
   - Admin registers authorized issuers (universities, certification bodies)
   - Issuers create tamper-proof credentials for DID holders
   - Supports credential revocation and expiration

3. **CredentialVerifier** (`blockchain/contracts/CredentialVerifier.sol`)
   - Employer verification workflow
   - Request → Approval → Verification flow
   - Cross-references DIDRegistry and CredentialIssuer
   - Provides quick QR code verification endpoint

### Frontend Architecture

Next.js 15 App Router structure with Web3 integration:

- **App Router**: `frontend/src/app/`
  - `page.tsx` - Main dashboard with credential display
  - `layout.tsx` - Root layout with metadata
  - `providers.tsx` - Web3 provider configuration (Wagmi + RainbowKit + React Query)

- **Web3 Configuration**: `frontend/config/wagmi.ts`
  - Configured for mainnet, Polygon, Sepolia, and local Hardhat networks
  - RainbowKit wallet connection UI

- **Current State**: Uses mock data; smart contract integration is the next phase

### Key Design Patterns

**Verification Workflow** (implemented in CredentialVerifier):
1. Employer creates verification request for specific credentials
2. Candidate (DID owner) approves the request via DID ownership check
3. System verifies credentials belong to candidate and are valid
4. Results stored on-chain with full audit trail

**Security Model**:
- Only DID controllers can approve verification requests
- Only authorized issuers can issue credentials
- Only credential issuers can revoke their own credentials
- Admin controls issuer registration (centralized trust anchor)

## Development Commands

### Blockchain Development

```bash
cd blockchain

# Install dependencies
npm install

# Run full test suite (recommended before any contract changes)
npm test

# Run specific test file
npx hardhat test test/FullWorkflow.test.js

# Start local Hardhat node (for development) - run in separate terminal
npm run node

# Compile contracts
npm run compile

# Deploy to local network (requires hardhat node running in another terminal)
npm run deploy:local
```

**Important**: The deployment script automatically:
- Deploys all 3 contracts (DIDRegistry, CredentialIssuer, CredentialVerifier)
- Saves deployment info to `blockchain/deployments/localhost.json`
- Exports ABIs to `blockchain/deployments/abis/`
- Creates frontend-ready config at `blockchain/deployments/frontend-config.json`
- Copies config to `frontend/config/contracts.json` for use

**Important**: Always run `npx hardhat test` before committing contract changes. The test suite includes integration tests that verify the complete workflow.

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Start development server (uses Turbopack)
npm run dev
# Access at http://localhost:3000

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

### Backend Development (Skeleton Only)

```bash
cd backend

# Install dependencies
npm install

# Structure exists but implementation is minimal
```

## Smart Contract Details

### Gas Optimization
- Contracts use Solidity 0.8.19 with optimizer enabled (200 runs)
- Gas costs (approximate on mainnet):
  - DID Creation: ~183k gas
  - Credential Issuance: ~294k gas
  - Verification: ~289k gas

### OpenZeppelin Dependencies
- Contracts use `@openzeppelin/contracts` v5.3.0 for security patterns
- Located in `blockchain/node_modules/@openzeppelin/contracts`

### Testing Pattern
Test files use Mocha + Chai with Hardhat:
- `DIDRegistry.test.js` - Unit tests for DID functionality
- `FullWorkflow.test.js` - Integration test simulating complete user journey (Jacob → Colby → Google scenario)

The integration test demonstrates:
1. Student creates DID
2. University gets authorized and issues diploma
3. Employer requests verification
4. Student approves request
5. System verifies and returns results
6. QR code quick verification

## Frontend-Blockchain Integration (Next Steps)

To connect the frontend to smart contracts:

1. Deploy contracts to a network (local Hardhat, Sepolia testnet, etc.)
2. Add contract addresses and ABIs to frontend config
3. Replace mock data in `frontend/src/app/page.tsx` with contract reads
4. Implement write functions for credential issuance/verification
5. Add transaction status handling and user feedback
6. Set up event listeners for real-time updates

The Wagmi configuration already supports the necessary networks. Contract ABIs can be found in `blockchain/artifacts/contracts/`.

## Project Structure Notes

- **Monorepo structure**: Frontend, blockchain, and backend are separate packages
- **No root package.json**: Each component has its own dependencies
- **Empty files**: Many configuration files (`.eslintrc.js`, `.prettierrc`, `docker-compose.yml`) are empty placeholders
- **Documentation**: `docs/` directory contains architecture and API documentation

## Network Configuration

Frontend is configured for:
- **Mainnet** (Ethereum mainnet)
- **Polygon** (Layer 2 for lower gas fees)
- **Sepolia** (Testnet for development)
- **Hardhat** (Local development, chainId: 1337)

Hardhat config (`blockchain/hardhat.config.js`) uses chainId 1337 for local development.

## Common Workflows

### Adding a New Contract Feature
1. Modify contract in `blockchain/contracts/`
2. Add/update tests in `blockchain/test/`
3. Run `npx hardhat test` to verify
4. Update integration test if workflow changes
5. Document gas impact if significant

### Testing the Complete System Locally
1. Start Hardhat node: `cd blockchain && npx hardhat node`
2. Deploy contracts to local network
3. Note deployed contract addresses
4. Update frontend config with addresses and ABIs
5. Start frontend: `cd frontend && npm run dev`
6. Connect wallet to localhost:8545 (Hardhat network)

### Understanding the Credential Flow
Read `blockchain/test/FullWorkflow.test.js` - it's the best documentation of how all three contracts work together. The test includes console.log statements that explain each step.
