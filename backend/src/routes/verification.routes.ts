import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate, requireRole, requireOrganization, validateIntParam, validateAddressParam } from '../middleware/auth';
import {
  requestVerification,
  approveVerification,
  executeVerification,
  getVerificationResults,
  quickVerify,
  getEmployerRequests,
  getCandidateRequests,
} from '../services/verification.service';
import { parsePagination } from '../middleware/pagination';
import { getOrganizationById, getProviderByDid } from '../db/database';
import { mapContractError } from '../middleware/errorHandler';
import { publicVerifyLimiter } from '../middleware/rateLimit';
import { UserRole, ApiResponse } from '../types';

const router = Router();

const requestVerificationSchema = z.object({
  candidateDID: z.string().min(1),
  credentialIds: z.array(z.number().int().nonnegative()).min(1).max(50),
  validForHours: z.number().int().min(1).max(8760),
});

const approveVerificationSchema = z.object({
  candidateDID: z.string().min(1),
});

router.post(
  '/',
  authenticate,
  requireRole(UserRole.VERIFIER_OPERATOR, UserRole.ADMIN),
  requireOrganization,
  validate(requestVerificationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { candidateDID, credentialIds, validForHours } = req.body;

      const org = getOrganizationById(req.user!.organizationId!);
      if (!org) {
        const response: ApiResponse = { success: false, error: 'Organization not found' };
        res.status(403).json(response);
        return;
      }

      const result = await requestVerification(
        org.wallet_address,
        candidateDID,
        credentialIds,
        validForHours,
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

router.post(
  '/:id/approve',
  authenticate,
  validateIntParam('id'),
  validate(approveVerificationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestId = parseInt(req.params.id as string, 10);
      const { candidateDID } = req.body;

      // Authorization check first -- before revealing whether the DID exists.
      // Only admins can approve on behalf of providers in v1 (since we don't yet have
      // provider-level user accounts). This prevents any authenticated user from approving
      // arbitrary verification requests.
      if (req.user!.role !== UserRole.ADMIN) {
        const response: ApiResponse = { success: false, error: 'Only admins can approve verifications in v1' };
        res.status(403).json(response);
        return;
      }

      const provider = getProviderByDid(candidateDID);
      if (!provider) {
        const response: ApiResponse = { success: false, error: 'Provider not found for this DID' };
        res.status(404).json(response);
        return;
      }

      const result = await approveVerification(
        candidateDID,
        requestId,
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

router.post(
  '/:id/execute',
  authenticate,
  requireRole(UserRole.VERIFIER_OPERATOR, UserRole.ADMIN),
  requireOrganization,
  validateIntParam('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestId = parseInt(req.params.id as string, 10);

      const org = getOrganizationById(req.user!.organizationId!);
      if (!org) {
        const response: ApiResponse = { success: false, error: 'Organization not found' };
        res.status(403).json(response);
        return;
      }

      const result = await executeVerification(
        org.wallet_address,
        requestId,
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

// Quick verify -- public endpoint, rate-limited
router.get(
  '/quick/:credentialId',
  publicVerifyLimiter,
  validateIntParam('credentialId'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const credentialId = parseInt(req.params.credentialId as string, 10);
      const result = await quickVerify(credentialId);

      const response: ApiResponse = {
        success: true,
        data: { credentialId, ...result },
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

// List verification requests for an employer (must be the employer's own org, or admin)
router.get(
  '/employer/:address',
  authenticate,
  requireRole(UserRole.VERIFIER_OPERATOR, UserRole.ADMIN),
  requireOrganization,
  validateAddressParam('address'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const address = req.params.address as string;

      // Enforce org ownership: verifier operators can only query their own org's address
      if (req.user!.role !== UserRole.ADMIN) {
        const org = getOrganizationById(req.user!.organizationId!);
        if (!org || org.wallet_address.toLowerCase() !== address.toLowerCase()) {
          const response: ApiResponse = { success: false, error: 'Cannot query another organization\'s requests' };
          res.status(403).json(response);
          return;
        }
      }

      const { limit, offset } = parsePagination(req);
      const allIds = await getEmployerRequests(address);
      const paginated = allIds.slice(offset, offset + limit);

      const response: ApiResponse = {
        success: true,
        data: { address, requestIds: paginated, total: allIds.length, limit, offset },
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

// List verification requests for a candidate DID (admin only in v1)
router.get(
  '/candidate/:didId',
  authenticate,
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const didId = req.params.didId as string;
      const { limit, offset } = parsePagination(req);
      const allIds = await getCandidateRequests(didId);
      const paginated = allIds.slice(offset, offset + limit);

      const response: ApiResponse = {
        success: true,
        data: { didId, requestIds: paginated, total: allIds.length, limit, offset },
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
  '/:id',
  authenticate,
  validateIntParam('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestId = parseInt(req.params.id as string, 10);

      const results = await getVerificationResults(requestId);

      const response: ApiResponse = {
        success: true,
        data: { requestId, ...results },
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
