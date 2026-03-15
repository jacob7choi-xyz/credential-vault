import { ethers } from 'ethers';
import { loadContractsConfig } from '../config';
import { getProvider } from './provider';
import { ContractsConfig } from '../types';

let contractsConfig: ContractsConfig | null = null;

// Cached read-only contract instances (no signer)
let readOnlyDIDRegistry: ethers.Contract | null = null;
let readOnlyCredentialIssuer: ethers.Contract | null = null;
let readOnlyCredentialVerifier: ethers.Contract | null = null;

function getContractsConfig(): ContractsConfig {
  if (!contractsConfig) {
    contractsConfig = loadContractsConfig();
  }
  return contractsConfig;
}

export function getDIDRegistryContract(
  signerOrProvider?: ethers.Signer | ethers.Provider
): ethers.Contract {
  const cfg = getContractsConfig();
  if (!signerOrProvider) {
    if (!readOnlyDIDRegistry) {
      readOnlyDIDRegistry = new ethers.Contract(
        cfg.contracts.DIDRegistry.address,
        cfg.contracts.DIDRegistry.abi as ethers.InterfaceAbi,
        getProvider()
      );
    }
    return readOnlyDIDRegistry;
  }
  return new ethers.Contract(
    cfg.contracts.DIDRegistry.address,
    cfg.contracts.DIDRegistry.abi as ethers.InterfaceAbi,
    signerOrProvider
  );
}

export function getCredentialIssuerContract(
  signerOrProvider?: ethers.Signer | ethers.Provider
): ethers.Contract {
  const cfg = getContractsConfig();
  if (!signerOrProvider) {
    if (!readOnlyCredentialIssuer) {
      readOnlyCredentialIssuer = new ethers.Contract(
        cfg.contracts.CredentialIssuer.address,
        cfg.contracts.CredentialIssuer.abi as ethers.InterfaceAbi,
        getProvider()
      );
    }
    return readOnlyCredentialIssuer;
  }
  return new ethers.Contract(
    cfg.contracts.CredentialIssuer.address,
    cfg.contracts.CredentialIssuer.abi as ethers.InterfaceAbi,
    signerOrProvider
  );
}

export function getCredentialVerifierContract(
  signerOrProvider?: ethers.Signer | ethers.Provider
): ethers.Contract {
  const cfg = getContractsConfig();
  if (!signerOrProvider) {
    if (!readOnlyCredentialVerifier) {
      readOnlyCredentialVerifier = new ethers.Contract(
        cfg.contracts.CredentialVerifier.address,
        cfg.contracts.CredentialVerifier.abi as ethers.InterfaceAbi,
        getProvider()
      );
    }
    return readOnlyCredentialVerifier;
  }
  return new ethers.Contract(
    cfg.contracts.CredentialVerifier.address,
    cfg.contracts.CredentialVerifier.abi as ethers.InterfaceAbi,
    signerOrProvider
  );
}

export function getContractAddresses() {
  const cfg = getContractsConfig();
  return {
    didRegistry: cfg.contracts.DIDRegistry.address,
    credentialIssuer: cfg.contracts.CredentialIssuer.address,
    credentialVerifier: cfg.contracts.CredentialVerifier.address,
  };
}
