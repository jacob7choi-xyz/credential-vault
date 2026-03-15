import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index';
import { initializeDatabase, closeDatabase, createUser } from '../src/db/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../src/config';
import { UserRole } from '../src/types';

const HARDHAT_AVAILABLE = process.env.TEST_WITH_CHAIN === 'true';

describe('DID Routes', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;

  beforeEach(() => {
    closeDatabase();
    initializeDatabase();
    app = createApp();

    // Create admin user in DB for is_active check
    const passwordHash = bcrypt.hashSync('Admin1234!pass', 12);
    createUser('admin@test.com', passwordHash, UserRole.ADMIN, null);

    adminToken = jwt.sign(
      { userId: 1, email: 'admin@test.com', role: UserRole.ADMIN, organizationId: null },
      config.jwtSecret,
      { expiresIn: '1h' }
    );
  });

  describe('POST /api/dids', () => {
    it('should validate request body', async () => {
      const res = await request(app)
        .post('/api/dids')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject empty didId', async () => {
      const res = await request(app)
        .post('/api/dids')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          didId: '',
          serviceEndpoint: 'https://example.com',
          displayName: 'Test Provider',
        });

      expect(res.status).toBe(400);
    });

    it('should reject DID IDs with special characters', async () => {
      const res = await request(app)
        .post('/api/dids')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          didId: 'did:vault:test<script>alert(1)</script>',
          serviceEndpoint: 'https://example.com',
          displayName: 'Test Provider',
        });

      expect(res.status).toBe(400);
    });

    it('should reject non-URL service endpoints', async () => {
      const res = await request(app)
        .post('/api/dids')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          didId: 'did:vault:test',
          serviceEndpoint: 'not-a-url',
          displayName: 'Test Provider',
        });

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/dids')
        .send({
          didId: 'did:vault:test',
          serviceEndpoint: 'https://example.com',
          displayName: 'Test Provider',
        });

      expect(res.status).toBe(401);
    });

    if (HARDHAT_AVAILABLE) {
      it('should create a DID on chain', async () => {
        const didId = `did:vault:test-${Date.now()}`;

        const res = await request(app)
          .post('/api/dids')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            didId,
            serviceEndpoint: 'https://example.com/api',
            displayName: 'Dr. Test',
            email: 'dr.test@example.com',
          });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.didId).toBe(didId);
        expect(res.body.data.transactionHash).toBeDefined();
        expect(res.body.data.blockNumber).toBeDefined();
      });
    }
  });

  describe('GET /api/dids/:didId', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/dids/test-did');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/dids/:didId/status', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/dids/test-did/status');
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/dids/:didId', () => {
    it('should require admin role', async () => {
      const operatorToken = jwt.sign(
        { userId: 2, email: 'op@test.com', role: UserRole.ISSUER_OPERATOR, organizationId: 1 },
        config.jwtSecret,
        { expiresIn: '1h' }
      );
      const passwordHash = bcrypt.hashSync('Operator1234!', 12);
      createUser('op@test.com', passwordHash, UserRole.ISSUER_OPERATOR, null);

      const res = await request(app)
        .delete('/api/dids/did:vault:test')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(403);
    });
  });
});
