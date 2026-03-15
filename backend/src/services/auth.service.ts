import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { createUser, getUserByEmail } from '../db/database';
import { JwtPayload, UserRole } from '../types';

const SALT_ROUNDS = 12;

export async function registerUser(
  email: string,
  password: string,
  role: UserRole,
  organizationId: number | null
): Promise<{ id: number; email: string; role: UserRole }> {
  const existing = getUserByEmail(email);
  if (existing) {
    throw new Error('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = createUser(email, passwordHash, role, organizationId);

  return { id: user.id, email: user.email, role: user.role as UserRole };
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ token: string; user: { id: number; email: string; role: UserRole } }> {
  const user = getUserByEmail(email);
  if (!user || !user.is_active) {
    throw new Error('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role as UserRole,
    organizationId: user.organization_id,
  };

  const token = jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as string,
  } as jwt.SignOptions);

  return {
    token,
    user: { id: user.id, email: user.email, role: user.role as UserRole },
  };
}
