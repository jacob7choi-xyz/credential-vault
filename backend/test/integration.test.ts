import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index';
import { initializeDatabase, closeDatabase, createOrganization, createUser, getUserByEmail, getOrganizationByWallet } from '../src/db/database';
import { checkConnection } from '../src/chain/provider';
import { signTestToken } from './helpers';
import bcrypt from 'bcryptjs';
import { UserRole, OrgType } from '../src/types';

const HARDHAT_AVAILABLE = process.env.TEST_WITH_CHAIN === 'true';

// Integration tests require a running Hardhat node with deployed contracts.
// Run with: TEST_WITH_CHAIN=true npx vitest run test/integration.test.ts
//
// Prerequisites:
//   1. cd blockchain && npx hardhat node
//   2. cd blockchain && npm run deploy:local
//   3. cd backend && TEST_WITH_CHAIN=true npx vitest run test/integration.test.ts

describe.skipIf(!HARDHAT_AVAILABLE)('Integration Tests (Hardhat)', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;

  beforeAll(async () => {
    closeDatabase();
    initializeDatabase();
    app = createApp();

    const connected = await checkConnection();
    if (!connected) {
      throw new Error('Hardhat node not available. Start with: cd blockchain && npx hardhat node');
    }

    // Create admin user
    const passwordHash = bcrypt.hashSync('Admin1234!pass', 12);
    createUser('admin@test.com', passwordHash, UserRole.ADMIN, null);

    // Login to get a properly signed token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'Admin1234!pass' });

    adminToken = loginRes.body.data.token;
  });

  afterAll(() => {
    closeDatabase();
  });

  it('should report healthy status with blockchain connected', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.blockchain.connected).toBe(true);
    expect(res.body.data.blockchain.blockNumber).toBeGreaterThan(0);
  });

  it('should create a DID on chain', async () => {
    const didId = `did:vault:integration-${Date.now()}`;

    const res = await request(app)
      .post('/api/dids')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        didId,
        serviceEndpoint: 'https://example.com/api',
        displayName: 'Integration Test Provider',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.didId).toBe(didId);
    expect(res.body.data.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(res.body.data.blockNumber).toBeGreaterThan(0);
  });

  it('should read a DID from chain after creation', async () => {
    const didId = `did:vault:read-test-${Date.now()}`;

    await request(app)
      .post('/api/dids')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        didId,
        serviceEndpoint: 'https://example.com/read',
        displayName: 'Read Test Provider',
      });

    const res = await request(app)
      .get(`/api/dids/${didId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.didId).toBe(didId);
    expect(res.body.data.serviceEndpoint).toBe('https://example.com/read');
    expect(res.body.data.active).toBe(true);
  });

  it('should check DID active status', async () => {
    const didId = `did:vault:status-test-${Date.now()}`;

    await request(app)
      .post('/api/dids')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        didId,
        serviceEndpoint: 'https://example.com/status',
        displayName: 'Status Test Provider',
      });

    const res = await request(app)
      .get(`/api/dids/${didId}/status`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(true);
  });

  it('should register an issuer on chain', async () => {
    const issuerAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    const res = await request(app)
      .post('/api/admin/issuers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        issuerAddress,
        institutionName: 'Integration Test University',
      });

    // 201 if new, or a contract revert if already registered from a previous run
    expect([201, 409]).toContain(res.status);
  });

  it('should check issuer authorization', async () => {
    const issuerAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    const res = await request(app)
      .get(`/api/admin/issuers/${issuerAddress}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isAuthorized).toBe(true);
  });

  it('should issue a credential and verify it', async () => {
    // Each test is self-contained: create its own DID, org, issuer user
    const holderDID = `did:vault:holder-${Date.now()}`;
    await request(app)
      .post('/api/dids')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        didId: holderDID,
        serviceEndpoint: 'https://example.com/holder',
        displayName: 'Credential Holder',
      });

    // Create issuer org if it doesn't exist
    const issuerWallet = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    let org = getOrganizationByWallet(issuerWallet);
    if (!org) {
      org = createOrganization('Test University', OrgType.ISSUER, issuerWallet);
    }

    let issuerUser = getUserByEmail('issuer-integ@test.com');
    if (!issuerUser) {
      const issuerHash = bcrypt.hashSync('Issuer1234!pass', 12);
      issuerUser = createUser('issuer-integ@test.com', issuerHash, UserRole.ISSUER_OPERATOR, org.id);
    }

    const issuerToken = signTestToken(
      { userId: issuerUser.id, email: issuerUser.email, role: UserRole.ISSUER_OPERATOR, organizationId: org.id }
    );

    const futureExpiration = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
    const issueRes = await request(app)
      .post('/api/credentials')
      .set('Authorization', `Bearer ${issuerToken}`)
      .send({
        holderDID,
        credentialType: 'MedicalDegree',
        credentialHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        expirationDate: futureExpiration,
      });

    expect(issueRes.status).toBe(201);
    const credentialId = issueRes.body.data.credentialId;
    expect(credentialId).toBeDefined();

    // Verify via public endpoint
    const verifyRes = await request(app).get(`/api/credentials/${credentialId}/verify`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.isValid).toBe(true);
    expect(verifyRes.body.data.credentialType).toBe('MedicalDegree');

    // Quick verify
    const quickRes = await request(app).get(`/api/verifications/quick/${credentialId}`);
    expect(quickRes.status).toBe(200);
    expect(quickRes.body.data.isValid).toBe(true);
  });

  it('should complete the full verification workflow', async () => {
    const holderDID = `did:vault:workflow-${Date.now()}`;
    await request(app)
      .post('/api/dids')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        didId: holderDID,
        serviceEndpoint: 'https://example.com/workflow',
        displayName: 'Workflow Test Provider',
      });

    // Self-contained issuer setup
    const issuerWallet = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    let issuerOrg = getOrganizationByWallet(issuerWallet);
    if (!issuerOrg) {
      issuerOrg = createOrganization('Test University', OrgType.ISSUER, issuerWallet);
    }
    let issuerUser = getUserByEmail('issuer-integ@test.com');
    if (!issuerUser) {
      const issuerHash = bcrypt.hashSync('Issuer1234!pass', 12);
      issuerUser = createUser('issuer-integ@test.com', issuerHash, UserRole.ISSUER_OPERATOR, issuerOrg.id);
    }

    const issuerToken = signTestToken(
      { userId: issuerUser.id, email: issuerUser.email, role: UserRole.ISSUER_OPERATOR, organizationId: issuerOrg.id }
    );

    const futureExpiration = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
    const issueRes = await request(app)
      .post('/api/credentials')
      .set('Authorization', `Bearer ${issuerToken}`)
      .send({
        holderDID,
        credentialType: 'BoardCertification',
        credentialHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        expirationDate: futureExpiration,
      });

    expect(issueRes.status).toBe(201);
    const credentialId = parseInt(issueRes.body.data.credentialId, 10);

    // Self-contained verifier setup
    const verifierWallet = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
    let verifierOrg = getOrganizationByWallet(verifierWallet);
    if (!verifierOrg) {
      verifierOrg = createOrganization('Test Hospital', OrgType.VERIFIER, verifierWallet);
    }
    const verifierHash = bcrypt.hashSync('Verifier1234!pass', 12);
    const verifierUser = createUser(`verifier-${Date.now()}@test.com`, verifierHash, UserRole.VERIFIER_OPERATOR, verifierOrg.id);

    const verifierToken = signTestToken(
      { userId: verifierUser.id, email: verifierUser.email, role: UserRole.VERIFIER_OPERATOR, organizationId: verifierOrg.id }
    );

    // Step 1: Request verification
    const requestRes = await request(app)
      .post('/api/verifications')
      .set('Authorization', `Bearer ${verifierToken}`)
      .send({
        candidateDID: holderDID,
        credentialIds: [credentialId],
        validForHours: 24,
      });

    expect(requestRes.status).toBe(201);
    const requestId = parseInt(requestRes.body.data.requestId, 10);

    // Step 2: Approve (admin on behalf of provider)
    const approveRes = await request(app)
      .post(`/api/verifications/${requestId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ candidateDID: holderDID });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);

    // Step 3: Execute
    const executeRes = await request(app)
      .post(`/api/verifications/${requestId}/execute`)
      .set('Authorization', `Bearer ${verifierToken}`);

    expect(executeRes.status).toBe(200);
    expect(executeRes.body.success).toBe(true);

    // Step 4: Get results
    const resultsRes = await request(app)
      .get(`/api/verifications/${requestId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resultsRes.status).toBe(200);
    expect(resultsRes.body.data.results).toBeDefined();
    expect(resultsRes.body.data.results.length).toBe(1);
    expect(resultsRes.body.data.results[0].isValid).toBe(true);
    expect(resultsRes.body.data.results[0].credentialType).toBe('BoardCertification');
  });

  it('should deactivate a DID on chain', async () => {
    const didId = `did:vault:deactivate-${Date.now()}`;

    await request(app)
      .post('/api/dids')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        didId,
        serviceEndpoint: 'https://example.com/deactivate',
        displayName: 'Deactivation Test',
      });

    const deleteRes = await request(app)
      .delete(`/api/dids/${didId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    const statusRes = await request(app)
      .get(`/api/dids/${didId}/status`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.active).toBe(false);
  });

  it('should login, logout, and reject the revoked token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'Admin1234!pass' });

    const token = loginRes.body.data.token;

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(logoutRes.status).toBe(200);

    const protectedRes = await request(app)
      .get('/api/dids/test')
      .set('Authorization', `Bearer ${token}`);

    expect(protectedRes.status).toBe(401);
    expect(protectedRes.body.error).toBe('Token has been revoked');
  });
});
