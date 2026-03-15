import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate, requireRole } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { registerUser, loginUser } from '../services/auth.service';
import { logAudit } from '../db/database';
import { ActorType, UserRole, ApiResponse } from '../types';

const router = Router();

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,128}$/;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string()
    .min(8)
    .max(128)
    .regex(PASSWORD_REGEX, 'Password must contain uppercase, lowercase, digit, and special character'),
  role: z.enum(['issuer_operator', 'verifier_operator']),
  organizationId: z.number().int().positive().nullable().optional(),
});

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const result = await loginUser(email, password);

      logAudit(ActorType.USER, result.user.id.toString(), 'login', 'auth', email);

      const response: ApiResponse = {
        success: true,
        data: result,
      };
      res.json(response);
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid credentials') {
        logAudit(ActorType.SYSTEM, 'anonymous', 'login_failed', 'auth', req.body.email);
        const response: ApiResponse = { success: false, error: 'Invalid credentials' };
        res.status(401).json(response);
        return;
      }
      next(error);
    }
  }
);

router.post(
  '/register',
  authenticate,
  requireRole(UserRole.ADMIN),
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, role, organizationId } = req.body;
      const user = await registerUser(email, password, role, organizationId ?? null);

      logAudit(
        ActorType.USER,
        req.user!.userId.toString(),
        'register_user',
        'user',
        user.id.toString(),
        null,
        JSON.stringify({ email, role })
      );

      const response: ApiResponse = {
        success: true,
        data: { id: user.id, email: user.email, role: user.role },
      };
      res.status(201).json(response);
    } catch (error) {
      if (error instanceof Error && error.message === 'Email already registered') {
        const response: ApiResponse = { success: false, error: 'Email already registered' };
        res.status(409).json(response);
        return;
      }
      next(error);
    }
  }
);

export default router;
