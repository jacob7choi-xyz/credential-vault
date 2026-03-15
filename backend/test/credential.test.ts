import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index';
import { initializeDatabase, closeDatabase, createOrganization, createUser } from '../src/db/database';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../src/config';
import { UserRole, OrgType } from '../src/types';

describe('Credential Routes', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let issuerToken: string;

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

    // Create issuer org and user
    const org = createOrganization('Test University', OrgType.ISSUER, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    const issuerHash = bcrypt.hashSync('Issuer1234!pass', 12);
    createUser('issuer@test.com', issuerHash, UserRole.ISSUER_OPERATOR, org.id);

    issuerToken = jwt.sign(
      { userId: 2, email: 'issuer@test.com', role: UserRole.ISSUER_OPERATOR, organizationId: org.id },
      config.jwtSecret,
      { expiresIn: '1h' }
    );
  });

  describe('POST /api/credentials', () => {
    it('should validate request body', async () => {
      const res = await request(app)
        .post('/api/credentials')
        .set('Authorization', `Bearer ${issuerToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject past expiration date', async () => {
      const res = await request(app)
        .post('/api/credentials')
        .set('Authorization', `Bearer ${issuerToken}`)
        .send({
          holderDID: 'did:vault:test',
          credentialType: 'MedicalDegree',
          credentialHash: '0xabc123',
          expirationDate: 1, // Unix epoch -- the past
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('future');
    });

    it('should require issuer or admin role', async () => {
      const verifierHash = bcrypt.hashSync('Verifier1234!', 12);
      createUser('verifier@test.com', verifierHash, UserRole.VERIFIER_OPERATOR, null);
      const verifierToken = jwt.sign(
        { userId: 3, email: 'verifier@test.com', role: UserRole.VERIFIER_OPERATOR, organizationId: 1 },
        config.jwtSecret,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post('/api/credentials')
        .set('Authorization', `Bearer ${verifierToken}`)
        .send({
          holderDID: 'did:vault:test',
          credentialType: 'MedicalDegree',
          credentialHash: '0xabc123',
          expirationDate: Math.floor(Date.now() / 1000) + 86400,
        });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/credentials')
        .send({
          holderDID: 'did:vault:test',
          credentialType: 'MedicalDegree',
          credentialHash: '0xabc123',
          expirationDate: Math.floor(Date.now() / 1000) + 86400,
        });

      expect(res.status).toBe(401);
    });

    it('should require organization association', async () => {
      // Admin without org
      const res = await request(app)
        .post('/api/credentials')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          holderDID: 'did:vault:test',
          credentialType: 'MedicalDegree',
          credentialHash: '0xabc123',
          expirationDate: Math.floor(Date.now() / 1000) + 86400,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/credentials/:id', () => {
    it('should reject non-numeric id', async () => {
      const res = await request(app)
        .get('/api/credentials/abc')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('should reject negative id', async () => {
      const res = await request(app)
        .get('/api/credentials/-1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/credentials/1');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/credentials/:id/verify', () => {
    it('should be publicly accessible (no auth required)', async () => {
      const res = await request(app).get('/api/credentials/999/verify');
      // Will get a chain error (not 401), confirming no auth required
      expect(res.status).not.toBe(401);
    });

    it('should reject non-numeric id', async () => {
      const res = await request(app).get('/api/credentials/abc/verify');
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/credentials/:id', () => {
    it('should require issuer or admin role', async () => {
      const verifierHash = bcrypt.hashSync('Verifier1234!', 12);
      const verifierUser = createUser('verifier2@test.com', verifierHash, UserRole.VERIFIER_OPERATOR, null);
      const verifierToken = jwt.sign(
        { userId: verifierUser.id, email: 'verifier2@test.com', role: UserRole.VERIFIER_OPERATOR, organizationId: 1 },
        config.jwtSecret,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .delete('/api/credentials/1')
        .set('Authorization', `Bearer ${verifierToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/providers/:didId/credentials', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/providers/did:vault:test/credentials');
      expect(res.status).toBe(401);
    });
  });
});
