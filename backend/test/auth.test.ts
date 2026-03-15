import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index';
import { initializeDatabase, closeDatabase, createUser } from '../src/db/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../src/config';
import { UserRole } from '../src/types';

describe('Auth Routes', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;

  beforeEach(() => {
    closeDatabase();
    initializeDatabase();
    app = createApp();

    // Create admin user directly in DB
    const passwordHash = bcrypt.hashSync('Admin1234!pass', 12);
    createUser('admin@test.com', passwordHash, UserRole.ADMIN, null);

    adminToken = jwt.sign(
      { userId: 1, email: 'admin@test.com', role: UserRole.ADMIN, organizationId: null },
      config.jwtSecret,
      { expiresIn: '1h' }
    );
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'Admin1234!pass' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('admin@test.com');
      expect(res.body.data.user.role).toBe('admin');
    });

    it('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'wrongpassword1' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject nonexistent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'somepassword1' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should validate email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should require minimum password length', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject login for deactivated user', async () => {
      const passwordHash = bcrypt.hashSync('Deactivated1!x', 12);
      const user = createUser('deactivated@test.com', passwordHash, UserRole.ISSUER_OPERATOR, null);
      // Manually deactivate
      const { getDb } = await import('../src/db/database');
      getDb().prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(user.id);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'deactivated@test.com', password: 'Deactivated1!x' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/register', () => {
    it('should register new user when admin', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@test.com',
          password: 'NewUser1234!',
          role: 'issuer_operator',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('newuser@test.com');
      expect(res.body.data.role).toBe('issuer_operator');
      // Ensure password_hash is not in response
      expect(res.body.data.password_hash).toBeUndefined();
    });

    it('should reject weak password (no uppercase)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@test.com',
          password: 'weakpassword1!',
          role: 'issuer_operator',
        });

      expect(res.status).toBe(400);
    });

    it('should reject admin role in register (cannot create admins via API)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newadmin@test.com',
          password: 'Admin1234!pass',
          role: 'admin',
        });

      expect(res.status).toBe(400);
    });

    it('should reject registration without auth', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@test.com',
          password: 'NewUser1234!',
          role: 'issuer_operator',
        });

      expect(res.status).toBe(401);
    });

    it('should reject registration by non-admin', async () => {
      const operatorToken = jwt.sign(
        { userId: 2, email: 'op@test.com', role: UserRole.ISSUER_OPERATOR, organizationId: 1 },
        config.jwtSecret,
        { expiresIn: '1h' }
      );

      // Create the user in DB so is_active check passes
      const passwordHash = bcrypt.hashSync('Operator1234!', 12);
      createUser('op@test.com', passwordHash, UserRole.ISSUER_OPERATOR, null);

      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          email: 'newuser@test.com',
          password: 'NewUser1234!',
          role: 'issuer_operator',
        });

      expect(res.status).toBe(403);
    });

    it('should reject duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'admin@test.com',
          password: 'AnotherPass1!',
          role: 'issuer_operator',
        });

      expect(res.status).toBe(409);
    });
  });

  describe('JWT authentication', () => {
    it('should reject expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: 1, email: 'admin@test.com', role: UserRole.ADMIN, organizationId: null },
        config.jwtSecret,
        { expiresIn: '0s' }
      );

      const res = await request(app)
        .get('/api/dids/test-did')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });

    it('should reject malformed token', async () => {
      const res = await request(app)
        .get('/api/dids/test-did')
        .set('Authorization', 'Bearer not-a-real-token');

      expect(res.status).toBe(401);
    });

    it('should reject missing auth header', async () => {
      const res = await request(app).get('/api/dids/test-did');

      expect(res.status).toBe(401);
    });

    it('should reject token for deactivated user', async () => {
      const passwordHash = bcrypt.hashSync('Deactivated1!x', 12);
      const user = createUser('deac2@test.com', passwordHash, UserRole.ADMIN, null);
      const { getDb } = await import('../src/db/database');
      getDb().prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(user.id);

      const token = jwt.sign(
        { userId: user.id, email: 'deac2@test.com', role: UserRole.ADMIN, organizationId: null },
        config.jwtSecret,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/dids/test-did')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Account deactivated or not found');
    });
  });
});
