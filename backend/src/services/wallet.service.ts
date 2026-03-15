import { ethers } from 'ethers';
import { getSignerByAddress, getAdminSigner, getProviderSigner, getIssuerSigner } from '../chain/signer';
import { getProviderByDid, getProviderByWallet, getOrganizationByWallet } from '../db/database';
import { config } from '../config';

export function getSignerForProvider(didId: string): ethers.Wallet {
  const provider = getProviderByDid(didId);
  if (!provider) {
    throw new Error('Provider not found for this DID');
  }

  const signer = getSignerByAddress(provider.wallet_address);
  if (!signer) {
    throw new Error('Signer not available for this provider');
  }

  return signer;
}

export function getSignerForOrganization(walletAddress: string): ethers.Wallet {
  const signer = getSignerByAddress(walletAddress);
  if (!signer) {
    throw new Error('Signer not available for this organization');
  }
  return signer;
}

export function getNextAvailableProviderSigner(): { signer: ethers.Wallet; index: number } {
  for (let i = 0; i < config.providerPrivateKeys.length; i++) {
    const signer = getProviderSigner(i);
    const existing = getProviderByWallet(signer.address);
    if (!existing) {
      return { signer, index: i };
    }
  }
  throw new Error('No available provider signers. All wallets are already assigned.');
}

export function getNextAvailableIssuerSigner(): { signer: ethers.Wallet; index: number } {
  for (let i = 0; i < config.issuerPrivateKeys.length; i++) {
    const signer = getIssuerSigner(i);
    const existing = getOrganizationByWallet(signer.address);
    if (!existing) {
      return { signer, index: i };
    }
  }
  throw new Error('No available issuer signers. All wallets are already assigned.');
}

export { getAdminSigner };
