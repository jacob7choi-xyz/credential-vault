import { getCredentialIssuerContract } from '../chain/contracts';
import { getAdminSigner, getSignerByAddress } from '../chain/signer';
import { logAudit } from '../db/database';
import { ActorType, TransactionResult } from '../types';
import { logger } from '../logger';

export async function registerIssuer(
  issuerAddress: string,
  institutionName: string,
  actorId: string
): Promise<TransactionResult> {
  const signer = getAdminSigner();
  const contract = getCredentialIssuerContract(signer);

  logger.info(`Registering issuer as "${institutionName}"`);

  const tx = await contract.registerIssuer(issuerAddress, institutionName);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error('Transaction was dropped or replaced');
  }

  logAudit(
    ActorType.USER,
    actorId,
    'register_issuer',
    'issuer',
    issuerAddress,
    receipt.hash,
    JSON.stringify({ institutionName })
  );

  return {
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function deauthorizeIssuer(
  issuerAddress: string,
  actorId: string
): Promise<TransactionResult> {
  const signer = getAdminSigner();
  const contract = getCredentialIssuerContract(signer);

  const tx = await contract.deauthorizeIssuer(issuerAddress);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error('Transaction was dropped or replaced');
  }

  logAudit(
    ActorType.USER,
    actorId,
    'deauthorize_issuer',
    'issuer',
    issuerAddress,
    receipt.hash
  );

  return {
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function issueCredential(
  issuerWalletAddress: string,
  holderDID: string,
  credentialType: string,
  credentialHash: string,
  expirationDate: number,
  actorId: string
): Promise<TransactionResult & { credentialId: string }> {
  const signer = getSignerByAddress(issuerWalletAddress);
  if (!signer) {
    throw new Error('Signer not available for this issuer');
  }

  const contract = getCredentialIssuerContract(signer);

  logger.info(`Issuing ${credentialType} credential`);

  const tx = await contract.issueCredential(
    holderDID,
    credentialType,
    credentialHash,
    expirationDate
  );
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error('Transaction was dropped or replaced');
  }

  // Extract credential ID from event -- fail loudly on ABI mismatch
  const event = receipt.logs.find(
    (log: { fragment?: { name: string } }) => log.fragment?.name === 'CredentialIssued'
  );
  if (!event || !event.args) {
    throw new Error(
      'CredentialIssued event not found in transaction receipt. Possible ABI mismatch -- redeploy contracts.'
    );
  }
  const credentialId = event.args[0].toString();

  logAudit(
    ActorType.USER,
    actorId,
    'issue_credential',
    'credential',
    credentialId,
    receipt.hash,
    JSON.stringify({ holderDID, credentialType })
  );

  return {
    credentialId,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function revokeCredential(
  issuerWalletAddress: string,
  credentialId: number,
  actorId: string
): Promise<TransactionResult> {
  const signer = getSignerByAddress(issuerWalletAddress);
  if (!signer) {
    throw new Error('Signer not available for this issuer');
  }

  const contract = getCredentialIssuerContract(signer);

  const tx = await contract.revokeCredential(credentialId);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error('Transaction was dropped or replaced');
  }

  logAudit(
    ActorType.USER,
    actorId,
    'revoke_credential',
    'credential',
    credentialId.toString(),
    receipt.hash
  );

  return {
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function getCredential(credentialId: number): Promise<{
  exists: boolean;
  issuer: string;
  holderDID: string;
  credentialType: string;
  credentialHash: string;
  issuedAt: number;
  expirationDate: number;
  isRevoked: boolean;
}> {
  const contract = getCredentialIssuerContract();
  const cred = await contract.getCredential(credentialId);

  return {
    exists: cred.issuer !== '0x0000000000000000000000000000000000000000',
    issuer: cred.issuer,
    holderDID: cred.holderDID,
    credentialType: cred.credentialType,
    credentialHash: cred.credentialHash,
    issuedAt: Number(cred.issuedAt),
    expirationDate: Number(cred.expirationDate),
    isRevoked: cred.isRevoked,
  };
}

export async function verifyCredential(credentialId: number): Promise<{
  exists: boolean;
  isValid: boolean;
  institutionName: string;
  holderDID: string;
  credentialType: string;
}> {
  const contract = getCredentialIssuerContract();
  const result = await contract.verifyCredential(credentialId);

  return {
    exists: result[0],
    isValid: result[1],
    institutionName: result[2],
    holderDID: result[3],
    credentialType: result[4],
  };
}

export async function getHolderCredentials(holderDID: string): Promise<number[]> {
  const contract = getCredentialIssuerContract();
  const ids = await contract.getHolderCredentials(holderDID);
  return ids.map((id: bigint) => Number(id));
}

export async function isAuthorizedIssuer(address: string): Promise<boolean> {
  const contract = getCredentialIssuerContract();
  return contract.isAuthorizedIssuer(address);
}
