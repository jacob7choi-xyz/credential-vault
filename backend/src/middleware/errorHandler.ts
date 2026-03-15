import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { ApiResponse } from '../types';

const REVERT_TO_HTTP: Record<string, { status: number; message: string }> = {
  'DID already exists': { status: 409, message: 'DID already exists' },
  'DID does not exist': { status: 404, message: 'DID not found' },
  'Only admin': { status: 403, message: 'Admin access required' },
  'Only DID controller': { status: 403, message: 'Only the DID controller can perform this action' },
  'Only authorized issuer': { status: 403, message: 'Issuer authorization required' },
  'DID is not active': { status: 422, message: 'DID is not active' },
  'Candidate DID is not active': { status: 422, message: 'Candidate DID is not active' },
  'Credential does not exist': { status: 404, message: 'Credential not found' },
  'Credential already revoked': { status: 409, message: 'Credential already revoked' },
  'Holder DID is not active': { status: 422, message: 'Holder DID is not active' },
  'Issuer already registered': { status: 409, message: 'Issuer already registered' },
  'Issuer not authorized': { status: 403, message: 'Issuer not authorized' },
  'Verification request does not exist': { status: 404, message: 'Verification request not found' },
  'Already approved': { status: 409, message: 'Already approved' },
  'Address already has an active DID': { status: 409, message: 'Address already has an active DID' },
};

function extractRevertReason(error: unknown): string | null {
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;

    // ethers v6 contract call revert
    if (typeof err.reason === 'string') return err.reason;

    // nested revert in error data
    if (err.info && typeof err.info === 'object') {
      const info = err.info as Record<string, unknown>;
      if (info.error && typeof info.error === 'object') {
        const innerError = info.error as Record<string, unknown>;
        if (typeof innerError.message === 'string') {
          const match = innerError.message.match(/reverted with reason string '([^']+)'/);
          if (match) return match[1];
        }
      }
    }

    // raw message fallback
    if (typeof err.message === 'string') {
      const match = err.message.match(/reverted with reason string '([^']+)'/);
      if (match) return match[1];
    }
  }
  return null;
}

function classifyEthersError(error: unknown): { status: number; message: string } | null {
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    const code = err.code as string | undefined;

    switch (code) {
      case 'INSUFFICIENT_FUNDS':
        return { status: 503, message: 'Service temporarily unavailable' };
      case 'NONCE_EXPIRED':
        return { status: 503, message: 'Transaction conflict, please retry' };
      case 'NETWORK_ERROR':
      case 'SERVER_ERROR':
        return { status: 503, message: 'Blockchain network unavailable' };
      case 'CALL_EXCEPTION':
        // Fall through to revert reason extraction
        return null;
      case 'INVALID_ARGUMENT':
        return { status: 400, message: 'Invalid transaction parameters' };
    }
  }
  return null;
}

export function mapContractError(error: unknown): { status: number; message: string } {
  const reason = extractRevertReason(error);

  if (reason) {
    for (const [revertMsg, mapping] of Object.entries(REVERT_TO_HTTP)) {
      if (reason.includes(revertMsg)) {
        return mapping;
      }
    }
    logger.warn('Unmapped contract revert encountered');
    return { status: 400, message: 'Transaction failed' };
  }

  const ethersError = classifyEthersError(error);
  if (ethersError) return ethersError;

  return { status: 500, message: 'Internal server error' };
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Unhandled error', { error: err.message });

  const { status, message } = mapContractError(err);

  const response: ApiResponse = {
    success: false,
    error: message,
  };

  res.status(status).json(response);
}
