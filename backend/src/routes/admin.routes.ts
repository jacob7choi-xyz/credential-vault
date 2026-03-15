import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate, requireRole, validateAddressParam } from '../middleware/auth';
import { registerIssuer, deauthorizeIssuer, isAuthorizedIssuer } from '../services/credential.service';
import { createOrganization, logAudit } from '../db/database';
import { mapContractError } from '../middleware/errorHandler';
import { UserRole, ActorType, ApiResponse } from '../types';

const router = Router();

const registerIssuerSchema = z.object({
  issuerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  institutionName: z.string().min(1).max(256),
});

const createOrgSchema = z.object({
  name: z.string().min(1).max(256),
  type: z.enum(['issuer', 'verifier', 'cvo']),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
});

router.post(
  '/issuers',
  authenticate,
  requireRole(UserRole.ADMIN),
  validate(registerIssuerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { issuerAddress, institutionName } = req.body;

      const result = await registerIssuer(
        issuerAddress,
        institutionName,
        req.user!.userId.toString()
      );

      const response: ApiResponse = {
        success: true,
        data: { issuerAddress, institutionName, ...result },
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

router.delete(
  '/issuers/:address',
  authenticate,
  requireRole(UserRole.ADMIN),
  validateAddressParam('address'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await deauthorizeIssuer(
        req.params.address as string,
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

router.get(
  '/issuers/:address',
  authenticate,
  requireRole(UserRole.ADMIN),
  validateAddressParam('address'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const address = req.params.address as string;
      const authorized = await isAuthorizedIssuer(address);

      const response: ApiResponse = {
        success: true,
        data: { address, isAuthorized: authorized },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/organizations',
  authenticate,
  requireRole(UserRole.ADMIN),
  validate(createOrgSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, type, walletAddress } = req.body;
      const org = createOrganization(name, type, walletAddress);

      logAudit(
        ActorType.USER,
        req.user!.userId.toString(),
        'create_organization',
        'organization',
        org.id.toString(),
        null,
        JSON.stringify({ name, type })
      );

      const response: ApiResponse = {
        success: true,
        data: { id: org.id, name: org.name, type: org.type, created_at: org.created_at },
      };
      res.status(201).json(response);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
        const response: ApiResponse = {
          success: false,
          error: 'Organization with this wallet address already exists',
        };
        res.status(409).json(response);
        return;
      }
      next(error);
    }
  }
);

export default router;
