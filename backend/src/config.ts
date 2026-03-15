import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { ContractsConfig } from './types';

dotenv.config();

const JWT_EXPIRY_PATTERN = /^\d+[smhd]$/;

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
  chainId: parseInt(process.env.CHAIN_ID || '1337', 10),

  adminPrivateKey: process.env.ADMIN_PRIVATE_KEY || '',
  issuerPrivateKeys: (process.env.ISSUER_PRIVATE_KEYS || '').split(',').filter(Boolean),
  providerPrivateKeys: (process.env.PROVIDER_PRIVATE_KEYS || '').split(',').filter(Boolean),

  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',

  dbPath: process.env.DB_PATH || './data/credential_vault.db',

  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
} as const;

const DEV_JWT_SECRET = 'dev-secret-do-not-use-in-production';

export function validateConfig(): void {
  const isProduction = config.nodeEnv === 'production';
  const isTest = config.nodeEnv === 'test';

  if (!config.jwtSecret) {
    if (isProduction) {
      throw new Error('JWT_SECRET must be set in production. Refusing to start with empty secret.');
    }
    // Assign mutable override for dev/test only
    (config as { jwtSecret: string }).jwtSecret = DEV_JWT_SECRET;
  }

  if (isProduction && config.jwtSecret === DEV_JWT_SECRET) {
    throw new Error('JWT_SECRET must not use the default dev value in production.');
  }

  if (isProduction && config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production.');
  }

  if (!JWT_EXPIRY_PATTERN.test(config.jwtExpiresIn)) {
    throw new Error(`Invalid JWT_EXPIRES_IN format: "${config.jwtExpiresIn}". Expected pattern like "24h", "7d", "3600s".`);
  }

  if (!isTest && !config.adminPrivateKey) {
    throw new Error('ADMIN_PRIVATE_KEY must be set. Cannot start without an admin signer.');
  }

  if (isProduction && !process.env.CORS_ORIGINS) {
    throw new Error('CORS_ORIGINS must be set in production. Refusing to start without explicit origin whitelist.');
  }
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.length > 1) {
      return `${parsed.protocol}//${parsed.host}/***`;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '(invalid URL)';
  }
}

export function getSafeRpcUrl(): string {
  return redactUrl(config.rpcUrl);
}

export function loadContractsConfig(): ContractsConfig {
  const configPath = path.resolve(
    __dirname,
    '../../blockchain/deployments/frontend-config.json'
  );

  if (!fs.existsSync(configPath)) {
    throw new Error(
      'Contract config not found. Run "npm run deploy:local" in blockchain/ first.'
    );
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as ContractsConfig;
}
