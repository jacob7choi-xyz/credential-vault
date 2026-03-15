import { getDIDRegistryContract } from '../chain/contracts';
import { getSignerByAddress, getProviderSigner } from '../chain/signer';
import { createProvider, getProviderByDid, getProviderByWallet } from '../db/database';
import { logAudit } from '../db/database';
import { ActorType, TransactionResult } from '../types';
import { logger } from '../logger';
import { config } from '../config';

export async function createDID(
  didId: string,
  serviceEndpoint: string,
  displayName: string,
  email: string | null,
  actorId: string
): Promise<TransactionResult & { didId: string }> {
  // Find a provider signer whose wallet address is not yet assigned to any DID
  let signerIndex = -1;

  for (let i = 0; i < config.providerPrivateKeys.length; i++) {
    const signer = getProviderSigner(i);
    const existingProvider = getProviderByWallet(signer.address);
    if (!existingProvider) {
      signerIndex = i;
      break;
    }
  }

  if (signerIndex === -1) {
    throw new Error('No available provider signers. All wallets are already assigned to existing DIDs.');
  }

  const signer = getProviderSigner(signerIndex);
  const signerAddress = signer.address;
  const contract = getDIDRegistryContract(signer);

  logger.info(`Creating DID: ${didId}`);

  const tx = await contract.createDID(didId, serviceEndpoint);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error('Transaction was dropped or replaced');
  }

  // Store provider mapping in DB
  createProvider(didId, signerAddress, displayName, email);

  logAudit(
    ActorType.USER,
    actorId,
    'create_did',
    'did',
    didId,
    receipt.hash
  );

  return {
    didId,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function getDIDDocument(didId: string): Promise<{
  didId: string;
  controller: string;
  serviceEndpoint: string;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}> {
  const contract = getDIDRegistryContract();
  const doc = await contract.getDIDDocument(didId);

  return {
    didId,
    controller: doc.controller,
    serviceEndpoint: doc.serviceEndpoint,
    createdAt: Number(doc.createdAt),
    updatedAt: Number(doc.updatedAt),
    isActive: doc.isActive,
  };
}

export async function isDIDActive(didId: string): Promise<boolean> {
  const contract = getDIDRegistryContract();
  return contract.isDIDActive(didId);
}

export async function deactivateDID(
  didId: string,
  actorId: string
): Promise<TransactionResult> {
  const provider = getProviderByDid(didId);
  if (!provider) {
    throw new Error('Provider not found for this DID');
  }

  const signer = getSignerByAddress(provider.wallet_address);
  if (!signer) {
    throw new Error('Signer not available for this provider');
  }

  const contract = getDIDRegistryContract(signer);
  const tx = await contract.deactivateDID(didId);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error('Transaction was dropped or replaced');
  }

  logAudit(
    ActorType.USER,
    actorId,
    'deactivate_did',
    'did',
    didId,
    receipt.hash
  );

  return {
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}
