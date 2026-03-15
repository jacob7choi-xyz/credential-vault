import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate, requireRole } from '../middleware/auth';
import { createDID, getDIDDocument, isDIDActive, deactivateDID } from '../services/did.service';
import { mapContractError } from '../middleware/errorHandler';
import { UserRole, ApiResponse } from '../types';

const router = Router();

// Restrict DID IDs to safe characters: alphanumeric, colons, hyphens, dots, underscores
const DID_ID_PATTERN = /^[a-zA-Z0-9:.\-_]+$/;

const createDIDSchema = z.object({
  didId: z.string().min(1).max(256).regex(DID_ID_PATTERN, 'DID ID must contain only alphanumeric characters, colons, hyphens, dots, and underscores'),
  serviceEndpoint: z.string().min(1).max(1024).url(),
  displayName: z.string().min(1).max(256),
  email: z.string().email().nullable().optional(),
});

router.post(
  '/',
  authenticate,
  validate(createDIDSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { didId, serviceEndpoint, displayName, email } = req.body;
      const result = await createDID(
        didId,
        serviceEndpoint,
        displayName,
        email ?? null,
        req.user!.userId.toString()
      );

      const response: ApiResponse = {
        success: true,
        data: result,
      };
      res.status(201).json(response);
    } catch (error) {
      const mapped = mapContractError(error);
      if (mapped.status !== 500) {
        const response: ApiResponse = { success: false, error: mapped.message };
        res.status(mapped.status).json(response);
        return;
      }
      next(error);
    }
  }
);

router.get(
  '/:didId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await getDIDDocument(req.params.didId as string);
      const response: ApiResponse = {
        success: true,
        data: doc,
      };
      res.json(response);
    } catch (error) {
      const mapped = mapContractError(error);
      if (mapped.status !== 500) {
        const response: ApiResponse = { success: false, error: mapped.message };
        res.status(mapped.status).json(response);
        return;
      }
      next(error);
    }
  }
);

router.get(
  '/:didId/status',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const didId = req.params.didId as string;
      const isActive = await isDIDActive(didId);
      const response: ApiResponse = {
        success: true,
        data: { didId, isActive },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// Only admin can deactivate DIDs via API (destructive operation)
router.delete(
  '/:didId',
  authenticate,
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await deactivateDID(
        req.params.didId as string,
        req.user!.userId.toString()
      );
      const response: ApiResponse = {
        success: true,
        data: result,
      };
      res.json(response);
    } catch (error) {
      const mapped = mapContractError(error);
      if (mapped.status !== 500) {
        const response: ApiResponse = { success: false, error: mapped.message };
        res.status(mapped.status).json(response);
        return;
      }
      next(error);
    }
  }
);

export default router;
