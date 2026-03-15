export interface ContractConfig {
  address: string;
  abi: readonly Record<string, unknown>[];
}

export interface ContractsConfig {
  contracts: {
    DIDRegistry: ContractConfig;
    CredentialIssuer: ContractConfig;
    CredentialVerifier: ContractConfig;
  };
}

export enum UserRole {
  ADMIN = 'admin',
  ISSUER_OPERATOR = 'issuer_operator',
  VERIFIER_OPERATOR = 'verifier_operator',
}

export enum OrgType {
  ISSUER = 'issuer',
  VERIFIER = 'verifier',
  CVO = 'cvo',
}

export enum ActorType {
  USER = 'user',
  SYSTEM = 'system',
  API_KEY = 'api_key',
}

export interface Organization {
  id: number;
  name: string;
  type: OrgType;
  wallet_address: string;
  api_key_hash: string | null;
  created_at: string;
  is_active: number;
}

export interface User {
  id: number;
  organization_id: number | null;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
  is_active: number;
}

export interface Provider {
  id: number;
  did_id: string;
  wallet_address: string;
  display_name: string;
  email: string | null;
  created_at: string;
  is_active: number;
}

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  actor_type: ActorType;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  tx_hash: string | null;
  details: string | null;
}

export interface JwtPayload {
  userId: number;
  email: string;
  role: UserRole;
  organizationId: number | null;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TransactionResult {
  transactionHash: string;
  blockNumber: number;
}
