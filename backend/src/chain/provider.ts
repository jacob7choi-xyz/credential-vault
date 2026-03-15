import { ethers } from 'ethers';
import { config, getSafeRpcUrl } from '../config';
import { logger } from '../logger';

let provider: ethers.JsonRpcProvider | null = null;

const CHAIN_NAMES: Record<number, string> = {
  1: 'mainnet',
  1337: 'hardhat',
  11155111: 'sepolia',
  137: 'polygon',
};

export function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    const networkName = CHAIN_NAMES[config.chainId] || `chain-${config.chainId}`;
    provider = new ethers.JsonRpcProvider(config.rpcUrl, {
      chainId: config.chainId,
      name: networkName,
    });
    logger.debug(`RPC provider initialized: ${getSafeRpcUrl()} (chainId: ${config.chainId})`);
  }
  return provider;
}

export async function getBlockNumber(): Promise<number> {
  return getProvider().getBlockNumber();
}

export async function checkConnection(): Promise<boolean> {
  try {
    await getProvider().getBlockNumber();
    return true;
  } catch {
    return false;
  }
}
