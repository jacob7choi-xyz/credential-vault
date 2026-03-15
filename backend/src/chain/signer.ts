import { ethers } from 'ethers';
import { config } from '../config';
import { getProvider } from './provider';
import { logger } from '../logger';

let adminWallet: ethers.Wallet | null = null;
const issuerWallets: Map<number, ethers.Wallet> = new Map();
const providerWallets: Map<number, ethers.Wallet> = new Map();

// O(1) address -> wallet lookup, built lazily
let addressIndex: Map<string, ethers.Wallet> | null = null;

function buildAddressIndex(): Map<string, ethers.Wallet> {
  const index = new Map<string, ethers.Wallet>();

  const admin = getAdminSigner();
  index.set(admin.address.toLowerCase(), admin);

  for (let i = 0; i < config.issuerPrivateKeys.length; i++) {
    const w = getIssuerSigner(i);
    index.set(w.address.toLowerCase(), w);
  }

  for (let i = 0; i < config.providerPrivateKeys.length; i++) {
    const w = getProviderSigner(i);
    index.set(w.address.toLowerCase(), w);
  }

  return index;
}

export function getAdminSigner(): ethers.Wallet {
  if (!adminWallet) {
    if (!config.adminPrivateKey) {
      throw new Error('ADMIN_PRIVATE_KEY not configured');
    }
    adminWallet = new ethers.Wallet(config.adminPrivateKey, getProvider());
    logger.debug(`Admin signer initialized: ${adminWallet.address}`);
  }
  return adminWallet;
}

export function getIssuerSigner(index: number): ethers.Wallet {
  if (!issuerWallets.has(index)) {
    if (index >= config.issuerPrivateKeys.length) {
      throw new Error(
        `Issuer signer index ${index} out of range. Only ${config.issuerPrivateKeys.length} issuer keys configured.`
      );
    }
    const wallet = new ethers.Wallet(config.issuerPrivateKeys[index], getProvider());
    issuerWallets.set(index, wallet);
    logger.debug(`Issuer signer ${index} initialized`);
  }
  return issuerWallets.get(index)!;
}

export function getProviderSigner(index: number): ethers.Wallet {
  if (!providerWallets.has(index)) {
    if (index >= config.providerPrivateKeys.length) {
      throw new Error(
        `Provider signer index ${index} out of range. Only ${config.providerPrivateKeys.length} provider keys configured.`
      );
    }
    const wallet = new ethers.Wallet(config.providerPrivateKeys[index], getProvider());
    providerWallets.set(index, wallet);
    logger.debug(`Provider signer ${index} initialized`);
  }
  return providerWallets.get(index)!;
}

export function getSignerByAddress(address: string): ethers.Wallet | null {
  if (!addressIndex) {
    addressIndex = buildAddressIndex();
  }
  return addressIndex.get(address.toLowerCase()) || null;
}

// Reset cached state (used by tests)
export function resetSignerCache(): void {
  adminWallet = null;
  issuerWallets.clear();
  providerWallets.clear();
  addressIndex = null;
}
