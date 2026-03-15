import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getUserById, isTokenBlacklisted } from '../db/database';
import { JwtPayload, UserRole, ApiResponse } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const response: ApiResponse = { success: false, error: 'Authentication required' };
    res.status(401).json(response);
    return;
  }

  const token = authHeader.slice(7);

  try {
    // Check token blacklist before verifying (fast SHA-256 lookup)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (isTokenBlacklisted(tokenHash)) {
      const response: ApiResponse = { success: false, error: 'Token has been revoked' };
      res.status(401).json(response);
      return;
    }

    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: 'credential-vault',
      audience: 'credential-vault-api',
    }) as JwtPayload;

    // Verify user still exists and is active in DB, and use fresh role/org from DB
    const user = getUserById(payload.userId);
    if (!user || user.is_active !== 1) {
      const response: ApiResponse = { success: false, error: 'Account deactivated or not found' };
      res.status(401).json(response);
      return;
    }

    // Use current DB values for role and org -- prevents stale JWT from granting
    // elevated privileges after demotion or org reassignment
    req.user = {
      userId: payload.userId,
      email: user.email,
      role: user.role as UserRole,
      organizationId: user.organization_id,
    };
    next();
  } catch {
    const response: ApiResponse = { success: false, error: 'Invalid or expired token' };
    res.status(401).json(response);
    return;
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      const response: ApiResponse = { success: false, error: 'Authentication required' };
      res.status(401).json(response);
      return;
    }

    if (!roles.includes(req.user.role)) {
      const response: ApiResponse = { success: false, error: 'Insufficient permissions' };
      res.status(403).json(response);
      return;
    }

    next();
  };
}

// Middleware to validate Ethereum address in route params
const ETH_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function validateAddressParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const address = req.params[paramName] as string;
    if (!address || !ETH_ADDRESS_PATTERN.test(address)) {
      const response: ApiResponse = { success: false, error: 'Invalid Ethereum address' };
      res.status(400).json(response);
      return;
    }
    next();
  };
}

// Middleware to validate integer ID in route params (must be positive integer, no partial strings)
const POSITIVE_INT_PATTERN = /^\d+$/;

export function validateIntParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const raw = req.params[paramName] as string;
    if (!raw || !POSITIVE_INT_PATTERN.test(raw)) {
      const response: ApiResponse = { success: false, error: `Invalid ${paramName}` };
      res.status(400).json(response);
      return;
    }
    const value = parseInt(raw, 10);
    if (value < 1) {
      const response: ApiResponse = { success: false, error: `Invalid ${paramName}` };
      res.status(400).json(response);
      return;
    }
    next();
  };
}

// Middleware to require the user is associated with an organization
export function requireOrganization(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.organizationId) {
    const response: ApiResponse = { success: false, error: 'User not associated with an organization' };
    res.status(403).json(response);
    return;
  }
  next();
}
