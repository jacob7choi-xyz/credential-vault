import { getCredentialVerifierContract } from '../chain/contracts';
import { getSignerByAddress } from '../chain/signer';
import { getProviderByDid } from '../db/database';
import { logAudit } from '../db/database';
import { ActorType, TransactionResult } from '../types';
import { logger } from '../logger';

export async function requestVerification(
  employerWalletAddress: string,
  candidateDID: string,
  credentialIds: number[],
  validForHours: number,
  actorId: string
): Promise<TransactionResult & { requestId: string }> {
  const signer = getSignerByAddress(employerWalletAddress);
  if (!signer) {
    throw new Error('Signer not available for this employer');
  }

  const contract = getCredentialVerifierContract(signer);

  logger.info(`Requesting verification for ${credentialIds.length} credentials`);

  const tx = await contract.requestVerification(candidateDID, credentialIds, validForHours);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error('Transaction was dropped or replaced');
  }

  const event = receipt.logs.find(
    (log: { fragment?: { name: string } }) => log.fragment?.name === 'VerificationRequested'
  );
  if (!event || !event.args) {
    throw new Error(
      'VerificationRequested event not found in transaction receipt. Possible ABI mismatch -- redeploy contracts.'
    );
  }
  const requestId = event.args[0].toString();

  logAudit(
    ActorType.USER,
    actorId,
    'request_verification',
    'verification',
    requestId,
    receipt.hash,
    JSON.stringify({ candidateDID, credentialIds, validForHours })
  );

  return {
    requestId,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function approveVerification(
  candidateDID: string,
  requestId: number,
  actorId: string
): Promise<TransactionResult> {
  const provider = getProviderByDid(candidateDID);
  if (!provider) {
    throw new Error('Provider not found for this DID');
  }

  const signer = getSignerByAddress(provider.wallet_address);
  if (!signer) {
    throw new Error('Signer not available for this provider');
  }

  const contract = getCredentialVerifierContract(signer);

  logger.info(`Approving verification request ${requestId}`);

  const tx = await contract.approveVerification(requestId);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error('Transaction was dropped or replaced');
  }

  logAudit(
    ActorType.USER,
    actorId,
    'approve_verification',
    'verification',
    requestId.toString(),
    receipt.hash,
    JSON.stringify({ candidateDID })
  );

  return {
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function executeVerification(
  employerWalletAddress: string,
  requestId: number,
  actorId: string
): Promise<TransactionResult> {
  const signer = getSignerByAddress(employerWalletAddress);
  if (!signer) {
    throw new Error('Signer not available for this employer');
  }

  const contract = getCredentialVerifierContract(signer);

  logger.info(`Executing verification request ${requestId}`);

  const tx = await contract.executeVerification(requestId);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error('Transaction was dropped or replaced');
  }

  logAudit(
    ActorType.USER,
    actorId,
    'execute_verification',
    'verification',
    requestId.toString(),
    receipt.hash
  );

  return {
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function quickVerify(credentialId: number): Promise<{
  isValid: boolean;
  issuerName: string;
  credentialType: string;
  holderDID: string;
}> {
  const contract = getCredentialVerifierContract();
  const result = await contract.quickVerify(credentialId);

  return {
    isValid: result[0],
    issuerName: result[1],
    credentialType: result[2],
    holderDID: result[3],
  };
}

export async function getVerificationResults(requestId: number): Promise<{
  results: Array<{
    credentialId: number;
    isValid: boolean;
    issuerName: string;
    credentialType: string;
  }>;
}> {
  const contract = getCredentialVerifierContract();
  const results = await contract.getVerificationResults(requestId);

  return {
    results: results.map((r: { credentialId: bigint; isValid: boolean; issuerName: string; credentialType: string }) => ({
      credentialId: Number(r.credentialId),
      isValid: r.isValid,
      issuerName: r.issuerName,
      credentialType: r.credentialType,
    })),
  };
}

export async function getEmployerRequests(employerAddress: string): Promise<number[]> {
  const contract = getCredentialVerifierContract();
  const ids = await contract.getEmployerRequests(employerAddress);
  return ids.map((id: bigint) => Number(id));
}

export async function getCandidateRequests(candidateDID: string): Promise<number[]> {
  const contract = getCredentialVerifierContract();
  const ids = await contract.getCandidateRequests(candidateDID);
  return ids.map((id: bigint) => Number(id));
}
