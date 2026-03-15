import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index';
import { initializeDatabase, closeDatabase, createOrganization, createUser } from '../src/db/database';
import bcrypt from 'bcryptjs';
import { UserRole, OrgType } from '../src/types';
import { signTestToken } from './helpers';

describe('Verification Routes', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let verifierToken: string;

  beforeEach(() => {
    closeDatabase();
    initializeDatabase();
    app = createApp();

    const adminHash = bcrypt.hashSync('Admin1234!pass', 12);
    createUser('admin@test.com', adminHash, UserRole.ADMIN, null);

    adminToken = signTestToken(
      { userId: 1, email: 'admin@test.com', role: UserRole.ADMIN, organizationId: null }
    );

    const org = createOrganization('Test Hospital', OrgType.VERIFIER, '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
    const verifierHash = bcrypt.hashSync('Verifier1234!', 12);
    createUser('verifier@test.com', verifierHash, UserRole.VERIFIER_OPERATOR, org.id);

    verifierToken = signTestToken(
      { userId: 2, email: 'verifier@test.com', role: UserRole.VERIFIER_OPERATOR, organizationId: org.id }
    );
  });

  describe('POST /api/verifications', () => {
    it('should validate request body', async () => {
      const res = await request(app)
        .post('/api/verifications')
        .set('Authorization', `Bearer ${verifierToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should require verifier or admin role', async () => {
      const issuerHash = bcrypt.hashSync('Issuer1234!pass', 12);
      createUser('issuer@test.com', issuerHash, UserRole.ISSUER_OPERATOR, null);

      const issuerToken = signTestToken(
        { userId: 3, email: 'issuer@test.com', role: UserRole.ISSUER_OPERATOR, organizationId: 1 }
      );

      const res = await request(app)
        .post('/api/verifications')
        .set('Authorization', `Bearer ${issuerToken}`)
        .send({
          candidateDID: 'did:vault:test',
          credentialIds: [1],
          validForHours: 24,
        });

      expect(res.status).toBe(403);
    });

    it('should validate credential count limit', async () => {
      const res = await request(app)
        .post('/api/verifications')
        .set('Authorization', `Bearer ${verifierToken}`)
        .send({
          candidateDID: 'did:vault:test',
          credentialIds: Array.from({ length: 51 }, (_, i) => i),
          validForHours: 24,
        });

      expect(res.status).toBe(400);
    });

    it('should validate validForHours range', async () => {
      const res = await request(app)
        .post('/api/verifications')
        .set('Authorization', `Bearer ${verifierToken}`)
        .send({
          candidateDID: 'did:vault:test',
          credentialIds: [1],
          validForHours: 9999,
        });

      expect(res.status).toBe(400);
    });

    it('should reject empty credentialIds array', async () => {
      const res = await request(app)
        .post('/api/verifications')
        .set('Authorization', `Bearer ${verifierToken}`)
        .send({
          candidateDID: 'did:vault:test',
          credentialIds: [],
          validForHours: 24,
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/verifications/:id/approve', () => {
    it('should validate request body', async () => {
      const res = await request(app)
        .post('/api/verifications/1/approve')
        .set('Authorization', `Bearer ${adminToken}`);

      // adminToken has no org -- but the handler checks admin role first, then body.
      // With empty body, Zod rejects before the handler runs.
      expect(res.status).toBe(400);
    });

    it('should reject non-numeric id', async () => {
      const res = await request(app)
        .post('/api/verifications/abc/approve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ candidateDID: 'did:vault:test' });

      expect(res.status).toBe(400);
    });

    it('should require admin role for approval', async () => {
      const res = await request(app)
        .post('/api/verifications/1/approve')
        .set('Authorization', `Bearer ${verifierToken}`)
        .send({ candidateDID: 'did:vault:test' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/verifications/:id/execute', () => {
    it('should require verifier or admin role', async () => {
      const issuerHash = bcrypt.hashSync('Issuer1234!pass', 12);
      const issuerUser = createUser('issuer2@test.com', issuerHash, UserRole.ISSUER_OPERATOR, null);

      const issuerToken = signTestToken(
        { userId: issuerUser.id, email: 'issuer2@test.com', role: UserRole.ISSUER_OPERATOR, organizationId: 1 }
      );

      const res = await request(app)
        .post('/api/verifications/1/execute')
        .set('Authorization', `Bearer ${issuerToken}`);

      expect(res.status).toBe(403);
    });

    it('should reject non-numeric id', async () => {
      const res = await request(app)
        .post('/api/verifications/abc/execute')
        .set('Authorization', `Bearer ${verifierToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/verifications/quick/:credentialId', () => {
    it('should be publicly accessible (no auth required)', async () => {
      const res = await request(app).get('/api/verifications/quick/999');
      expect(res.status).not.toBe(401);
    });

    it('should reject non-numeric credentialId', async () => {
      const res = await request(app).get('/api/verifications/quick/abc');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/verifications/employer/:address', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/verifications/employer/0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
      expect(res.status).toBe(401);
    });

    it('should require verifier or admin role', async () => {
      const issuerHash = bcrypt.hashSync('Issuer1234!pass', 12);
      createUser('issuer@test.com', issuerHash, UserRole.ISSUER_OPERATOR, null);

      const issuerToken = signTestToken(
        { userId: 3, email: 'issuer@test.com', role: UserRole.ISSUER_OPERATOR, organizationId: 1 }
      );

      const res = await request(app)
        .get('/api/verifications/employer/0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC')
        .set('Authorization', `Bearer ${issuerToken}`);

      expect(res.status).toBe(403);
    });

    it('should reject cross-org queries for non-admin', async () => {
      // Verifier org's wallet is 0x3C44Cd..., querying a different address should be rejected
      const res = await request(app)
        .get('/api/verifications/employer/0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
        .set('Authorization', `Bearer ${verifierToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/verifications/candidate/:didId', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/verifications/candidate/did:vault:test');
      expect(res.status).toBe(401);
    });

    it('should require admin role', async () => {
      const res = await request(app)
        .get('/api/verifications/candidate/did:vault:test')
        .set('Authorization', `Bearer ${verifierToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/verifications/:id', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/verifications/1');
      expect(res.status).toBe(401);
    });

    it('should reject non-numeric id', async () => {
      const res = await request(app)
        .get('/api/verifications/abc')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('Request ID headers', () => {
    it('should return X-Request-ID in response', async () => {
      const res = await request(app).get('/api/verifications/1');
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should echo back valid UUID X-Request-ID', async () => {
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const res = await request(app)
        .get('/api/verifications/1')
        .set('X-Request-ID', customId);

      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('should ignore non-UUID X-Request-ID', async () => {
      const res = await request(app)
        .get('/api/verifications/1')
        .set('X-Request-ID', 'not-a-uuid');

      // Should generate a new UUID instead of echoing the invalid one
      expect(res.headers['x-request-id']).not.toBe('not-a-uuid');
      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });
  });
});
