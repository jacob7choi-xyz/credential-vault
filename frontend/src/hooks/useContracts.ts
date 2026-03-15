import { useReadContract, useWriteContract } from 'wagmi'
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

// --- Verification Workflow Hooks ---

interface VerificationRequest {
  requestId: string
  employer: string
  candidateDID: string
  requestDate: bigint
  expirationDate: bigint
  isApproved: boolean
  isCompleted: boolean
}

interface VerificationResult {
  credentialId: string
  isValid: boolean
  isAuthentic: boolean
  issuerName: string
  credentialType: string
  verificationDate: bigint
}

// Hook to request verification (employer)
export function useRequestVerification() {
  const { writeContractAsync, isPending, isSuccess, error, data: hash } = useWriteContract()

  const requestVerification = async (
    requestId: string,
    candidateDID: string,
    requestedCredentials: string[],
    validForHours: bigint
  ) => {
    return writeContractAsync({
      ...contracts.CredentialVerifier,
      functionName: 'requestVerification',
      args: [requestId, candidateDID, requestedCredentials, validForHours],
    })
  }

  return { requestVerification, isPending, isSuccess, error, hash }
}

// Hook to approve verification (candidate/DID controller)
export function useApproveVerification() {
  const { writeContractAsync, isPending, isSuccess, error, data: hash } = useWriteContract()

  const approveVerification = async (requestId: string) => {
    return writeContractAsync({
      ...contracts.CredentialVerifier,
      functionName: 'approveVerification',
      args: [requestId],
    })
  }

  return { approveVerification, isPending, isSuccess, error, hash }
}

// Hook to execute verification (employer)
export function useExecuteVerification() {
  const { writeContractAsync, isPending, isSuccess, error, data: hash } = useWriteContract()

  const executeVerification = async (requestId: string) => {
    return writeContractAsync({
      ...contracts.CredentialVerifier,
      functionName: 'executeVerification',
      args: [requestId],
    })
  }

  return { executeVerification, isPending, isSuccess, error, hash }
}

// Hook to get employer's verification request IDs
export function useGetEmployerRequests(employer?: string) {
  const { data, isLoading, error, refetch } = useReadContract({
    ...contracts.CredentialVerifier,
    functionName: 'getEmployerRequests',
    args: employer ? [employer] : undefined,
    query: {
      enabled: !!employer,
    },
  })

  return {
    requestIds: data as string[] | undefined,
    isLoading,
    error,
    refetch,
  }
}

// Hook to get candidate's verification request IDs
export function useGetCandidateRequests(candidateDID?: string) {
  const { data, isLoading, error, refetch } = useReadContract({
    ...contracts.CredentialVerifier,
    functionName: 'getCandidateRequests',
    args: candidateDID ? [candidateDID] : undefined,
    query: {
      enabled: !!candidateDID,
    },
  })

  return {
    requestIds: data as string[] | undefined,
    isLoading,
    error,
    refetch,
  }
}

// Hook to get a single verification request (auto-getter from public mapping)
export function useGetVerificationRequest(requestId?: string) {
  const { data, isLoading, error } = useReadContract({
    ...contracts.CredentialVerifier,
    functionName: 'verificationRequests',
    args: requestId ? [requestId] : undefined,
    query: {
      enabled: !!requestId,
    },
  })

  // Solidity auto-getter omits dynamic arrays, returns 7-field tuple
  const result = data as [string, string, string, bigint, bigint, boolean, boolean] | undefined

  const request: VerificationRequest | undefined = result ? {
    requestId: result[0],
    employer: result[1],
    candidateDID: result[2],
    requestDate: result[3],
    expirationDate: result[4],
    isApproved: result[5],
    isCompleted: result[6],
  } : undefined

  return { request, isLoading, error }
}

// Hook to get verification results for a completed request
export function useGetVerificationResults(requestId?: string, isCompleted?: boolean) {
  const { data, isLoading, error } = useReadContract({
    ...contracts.CredentialVerifier,
    functionName: 'getVerificationResults',
    args: requestId ? [requestId] : undefined,
    query: {
      enabled: !!requestId && !!isCompleted,
    },
  })

  return {
    results: data as VerificationResult[] | undefined,
    isLoading,
    error,
  }
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
