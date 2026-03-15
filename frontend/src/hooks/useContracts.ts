import { useReadContract, useWriteContract, useAccount } from 'wagmi'
import contractsConfig from '../../config/contracts.json'

// Type definitions matching contract structs
interface DIDDocument {
  controller: string
  serviceEndpoint: string
  created: bigint
  updated: bigint
  active: boolean
}

interface Credential {
  credentialId: string
  holderDID: string
  issuerAddress: string
  institutionName: string
  credentialType: string
  credentialData: string
  issuedDate: bigint
  expirationDate: bigint
  isRevoked: boolean
}

// Contract config
const contracts = {
  DIDRegistry: {
    address: contractsConfig.contracts.DIDRegistry.address as `0x${string}`,
    abi: contractsConfig.contracts.DIDRegistry.abi,
  },
  CredentialIssuer: {
    address: contractsConfig.contracts.CredentialIssuer.address as `0x${string}`,
    abi: contractsConfig.contracts.CredentialIssuer.abi,
  },
  CredentialVerifier: {
    address: contractsConfig.contracts.CredentialVerifier.address as `0x${string}`,
    abi: contractsConfig.contracts.CredentialVerifier.abi,
  },
} as const

// Hook to check if user has a DID
export function useHasDID(didId?: string) {
  const { data: exists } = useReadContract({
    ...contracts.DIDRegistry,
    functionName: 'didExists',
    args: didId ? [didId] : undefined,
    query: {
      enabled: !!didId,
    },
  })

  return { exists: exists as boolean | undefined }
}

// Hook to get DID document
export function useGetDID(didId?: string) {
  const { data, isLoading, error } = useReadContract({
    ...contracts.DIDRegistry,
    functionName: 'getDIDDocument',
    args: didId ? [didId] : undefined,
    query: {
      enabled: !!didId,
    },
  })

  return {
    didDocument: data as DIDDocument | undefined,
    isLoading,
    error
  }
}

// Hook to create DID
export function useCreateDID() {
  const { writeContractAsync, isPending, isSuccess, error, data: hash } = useWriteContract()

  const createDID = async (didId: string, serviceEndpoint: string) => {
    return writeContractAsync({
      ...contracts.DIDRegistry,
      functionName: 'createDID',
      args: [didId, serviceEndpoint],
    })
  }

  return { createDID, isPending, isSuccess, error, hash }
}

// Hook to get user's credentials
export function useGetCredentials(holderDID?: string) {
  const { data, isLoading, error, refetch } = useReadContract({
    ...contracts.CredentialIssuer,
    functionName: 'getHolderCredentials',
    args: holderDID ? [holderDID] : undefined,
    query: {
      enabled: !!holderDID,
    },
  })

  return {
    credentialIds: data as string[] | undefined,
    isLoading,
    error,
    refetch
  }
}

// Hook to get credential details
export function useGetCredential(credentialId?: string) {
  const { data, isLoading, error } = useReadContract({
    ...contracts.CredentialIssuer,
    functionName: 'getCredential',
    args: credentialId ? [credentialId] : undefined,
    query: {
      enabled: !!credentialId,
    },
  })

  return {
    credential: data as Credential | undefined,
    isLoading,
    error
  }
}

// Hook to issue credential (issuer only)
export function useIssueCredential() {
  const { writeContractAsync, isPending, isSuccess, error, data: hash } = useWriteContract()

  const issueCredential = async (
    credentialId: string,
    holderDID: string,
    credentialType: string,
    credentialData: string,
    expirationDate: bigint
  ) => {
    return writeContractAsync({
      ...contracts.CredentialIssuer,
      functionName: 'issueCredential',
      args: [credentialId, holderDID, credentialType, credentialData, expirationDate],
    })
  }

  return { issueCredential, isPending, isSuccess, error, hash }
}

// Hook to register issuer (admin only)
export function useRegisterIssuer() {
  const { writeContractAsync, isPending, isSuccess, error, data: hash } = useWriteContract()

  const registerIssuer = async (issuerAddress: `0x${string}`, institutionName: string) => {
    return writeContractAsync({
      ...contracts.CredentialIssuer,
      functionName: 'registerIssuer',
      args: [issuerAddress, institutionName],
    })
  }

  return { registerIssuer, isPending, isSuccess, error, hash }
}

// Hook to check if address is authorized issuer
export function useIsAuthorizedIssuer(address?: `0x${string}`) {
  const { data } = useReadContract({
    ...contracts.CredentialIssuer,
    functionName: 'isAuthorizedIssuer',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })

  return { isAuthorized: data as boolean | undefined }
}

// Hook to quick verify credential
export function useQuickVerify(credentialId?: string) {
  const { data, isLoading } = useReadContract({
    ...contracts.CredentialVerifier,
    functionName: 'quickVerify',
    args: credentialId ? [credentialId] : undefined,
    query: {
      enabled: !!credentialId,
    },
  })

  const result = data as [boolean, string, string, string] | undefined

  return {
    isValid: result?.[0],
    issuerName: result?.[1],
    credentialType: result?.[2],
    holderDID: result?.[3],
    isLoading,
  }
}

export { contracts }
