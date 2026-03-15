import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index';
import { initializeDatabase, closeDatabase, createOrganization, createUser } from '../src/db/database';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../src/config';
import { UserRole, OrgType } from '../src/types';

describe('Verification Routes', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let verifierToken: string;

  beforeEach(() => {
    closeDatabase();
    initializeDatabase();
    app = createApp();

    // Create admin user in DB
    const adminHash = bcrypt.hashSync('Admin1234!pass', 12);
    createUser('admin@test.com', adminHash, UserRole.ADMIN, null);

    adminToken = jwt.sign(
      { userId: 1, email: 'admin@test.com', role: UserRole.ADMIN, organizationId: null },
      config.jwtSecret,
      { expiresIn: '1h' }
    );

    // Create verifier org and user
    const org = createOrganization('Test Hospital', OrgType.VERIFIER, '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
    const verifierHash = bcrypt.hashSync('Verifier1234!', 12);
    createUser('verifier@test.com', verifierHash, UserRole.VERIFIER_OPERATOR, org.id);

    verifierToken = jwt.sign(
      { userId: 2, email: 'verifier@test.com', role: UserRole.VERIFIER_OPERATOR, organizationId: org.id },
      config.jwtSecret,
      { expiresIn: '1h' }
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
      const issuerToken = jwt.sign(
        { userId: 3, email: 'issuer@test.com', role: UserRole.ISSUER_OPERATOR, organizationId: 1 },
        config.jwtSecret,
        { expiresIn: '1h' }
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
  });

  describe('POST /api/verifications/:id/approve', () => {
    it('should validate request body', async () => {
      const res = await request(app)
        .post('/api/verifications/1/approve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

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
      // verifierToken has role VERIFIER_OPERATOR, not ADMIN -- should be rejected
      // Note: returns 403 because the role check happens before the provider lookup
      const res = await request(app)
        .post('/api/verifications/1/approve')
        .set('Authorization', `Bearer ${verifierToken}`)
        .send({ candidateDID: 'did:vault:test' });

      // verifier_operator is not admin, so the admin check in the handler rejects with 403
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/verifications/:id/execute', () => {
    it('should require verifier or admin role', async () => {
      const issuerHash = bcrypt.hashSync('Issuer1234!pass', 12);
      const issuerUser = createUser('issuer2@test.com', issuerHash, UserRole.ISSUER_OPERATOR, null);
      const issuerToken = jwt.sign(
        { userId: issuerUser.id, email: 'issuer2@test.com', role: UserRole.ISSUER_OPERATOR, organizationId: 1 },
        config.jwtSecret,
        { expiresIn: '1h' }
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
});
