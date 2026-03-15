import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate, requireRole, requireOrganization, validateIntParam } from '../middleware/auth';
import { publicVerifyLimiter } from '../middleware/rateLimit';
import {
  issueCredential,
  revokeCredential,
  getCredential,
  verifyCredential,
  getHolderCredentials,
} from '../services/credential.service';
import { getOrganizationById } from '../db/database';
import { mapContractError } from '../middleware/errorHandler';
import { UserRole, ApiResponse } from '../types';
import { parsePagination } from '../middleware/pagination';

const router = Router();

const issueCredentialSchema = z.object({
  holderDID: z.string().min(1),
  credentialType: z.string().min(1).max(256),
  credentialHash: z.string().min(1).max(256),
  expirationDate: z.number().int().positive().refine(
    (val) => val > Math.floor(Date.now() / 1000),
    { message: 'Expiration date must be in the future' }
  ),
});

router.post(
  '/',
  authenticate,
  requireRole(UserRole.ISSUER_OPERATOR, UserRole.ADMIN),
  requireOrganization,
  validate(issueCredentialSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { holderDID, credentialType, credentialHash, expirationDate } = req.body;

      const org = getOrganizationById(req.user!.organizationId!);
      if (!org) {
        const response: ApiResponse = { success: false, error: 'Organization not found' };
        res.status(403).json(response);
        return;
      }

      const result = await issueCredential(
        org.wallet_address,
        holderDID,
        credentialType,
        credentialHash,
        expirationDate,
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
  '/:id',
  authenticate,
  validateIntParam('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const credentialId = parseInt(req.params.id as string, 10);

      const credential = await getCredential(credentialId);
      if (!credential.exists) {
        const response: ApiResponse = { success: false, error: 'Credential not found' };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: { id: credentialId, ...credential },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id/verify',
  publicVerifyLimiter,
  validateIntParam('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const credentialId = parseInt(req.params.id as string, 10);

      const result = await verifyCredential(credentialId);

      const response: ApiResponse = {
        success: true,
        data: { id: credentialId, ...result },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:id',
  authenticate,
  requireRole(UserRole.ISSUER_OPERATOR, UserRole.ADMIN),
  requireOrganization,
  validateIntParam('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const credentialId = parseInt(req.params.id as string, 10);

      const org = getOrganizationById(req.user!.organizationId!);
      if (!org) {
        const response: ApiResponse = { success: false, error: 'Organization not found' };
        res.status(403).json(response);
        return;
      }

      const result = await revokeCredential(
        org.wallet_address,
        credentialId,
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

// Provider credential listing is mounted separately
export const providerCredentialRouter = Router();

providerCredentialRouter.get(
  '/:didId/credentials',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const didId = req.params.didId as string;
      const { limit, offset } = parsePagination(req);
      const allIds = await getHolderCredentials(didId);
      const paginated = allIds.slice(offset, offset + limit);

      const response: ApiResponse = {
        success: true,
        data: { didId, credentialIds: paginated, total: allIds.length, limit, offset },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);
