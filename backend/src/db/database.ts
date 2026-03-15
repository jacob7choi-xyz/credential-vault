import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../logger';
import { Organization, User, Provider, AuditLogEntry, ActorType } from '../types';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    logger.info(`SQLite database opened at ${config.dbPath}`);
  }
  return db;
}

export function initializeDatabase(): void {
  const database = getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
  logger.info('Database schema initialized');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

// --- Organization queries ---

export function createOrganization(
  name: string,
  type: string,
  walletAddress: string
): Organization {
  const stmt = getDb().prepare(
    'INSERT INTO organizations (name, type, wallet_address) VALUES (?, ?, ?)'
  );
  const result = stmt.run(name, type, walletAddress);
  return getOrganizationById(result.lastInsertRowid as number)!;
}

export function getOrganizationById(id: number): Organization | undefined {
  return getDb()
    .prepare('SELECT * FROM organizations WHERE id = ?')
    .get(id) as Organization | undefined;
}

export function getOrganizationByWallet(walletAddress: string): Organization | undefined {
  return getDb()
    .prepare('SELECT * FROM organizations WHERE wallet_address = ?')
    .get(walletAddress) as Organization | undefined;
}

// --- User queries ---

export function createUser(
  email: string,
  passwordHash: string,
  role: string,
  organizationId: number | null
): User {
  const stmt = getDb().prepare(
    'INSERT INTO users (email, password_hash, role, organization_id) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(email, passwordHash, role, organizationId);
  return getUserById(result.lastInsertRowid as number)!;
}

export function getUserByEmail(email: string): User | undefined {
  return getDb()
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(email) as User | undefined;
}

export function getUserById(id: number): User | undefined {
  return getDb()
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(id) as User | undefined;
}

// --- Provider queries ---

export function createProvider(
  didId: string,
  walletAddress: string,
  displayName: string,
  email: string | null
): Provider {
  const stmt = getDb().prepare(
    'INSERT INTO providers (did_id, wallet_address, display_name, email) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(didId, walletAddress, displayName, email);
  return getProviderById(result.lastInsertRowid as number)!;
}

export function getProviderByDid(didId: string): Provider | undefined {
  return getDb()
    .prepare('SELECT * FROM providers WHERE did_id = ?')
    .get(didId) as Provider | undefined;
}

export function getProviderByWallet(walletAddress: string): Provider | undefined {
  return getDb()
    .prepare('SELECT * FROM providers WHERE wallet_address = ?')
    .get(walletAddress) as Provider | undefined;
}

export function getProviderById(id: number): Provider | undefined {
  return getDb()
    .prepare('SELECT * FROM providers WHERE id = ?')
    .get(id) as Provider | undefined;
}

// --- Audit log ---

export function logAudit(
  actorType: ActorType,
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  txHash: string | null = null,
  details: string | null = null
): void {
  getDb()
    .prepare(
      `INSERT INTO audit_log (actor_type, actor_id, action, resource_type, resource_id, tx_hash, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(actorType, actorId, action, resourceType, resourceId, txHash, details);
}

export function getAuditLogs(
  resourceType?: string,
  resourceId?: string,
  limit: number = 50
): AuditLogEntry[] {
  if (resourceType && resourceId) {
    return getDb()
      .prepare(
        'SELECT * FROM audit_log WHERE resource_type = ? AND resource_id = ? ORDER BY timestamp DESC LIMIT ?'
      )
      .all(resourceType, resourceId, limit) as AuditLogEntry[];
  }
  return getDb()
    .prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as AuditLogEntry[];
}
