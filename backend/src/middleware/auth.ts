import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getUserById } from '../db/database';
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
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
    }) as JwtPayload;

    // Verify user still exists and is active in DB
    const user = getUserById(payload.userId);
    if (!user || user.is_active !== 1) {
      const response: ApiResponse = { success: false, error: 'Account deactivated or not found' };
      res.status(401).json(response);
      return;
    }

    req.user = payload;
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

// Middleware to validate integer ID in route params
export function validateIntParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = parseInt(req.params[paramName] as string, 10);
    if (isNaN(value) || value < 0) {
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
