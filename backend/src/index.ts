import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, validateConfig, getSafeRpcUrl } from './config';
import { logger } from './logger';
import { initializeDatabase, closeDatabase } from './db/database';
import { getBlockNumber, checkConnection } from './chain/provider';
import { getContractAddresses } from './chain/contracts';
import { generalLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import didRoutes from './routes/did.routes';
import credentialRoutes, { providerCredentialRouter } from './routes/credential.routes';
import verificationRoutes from './routes/verification.routes';
import adminRoutes from './routes/admin.routes';

export function createApp() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: config.corsOrigins,
    credentials: false,
  }));
  app.use(express.json({ limit: '16kb' }));
  app.use(generalLimiter);

  // Health check -- does not expose internal URLs or contract addresses
  app.get('/api/health', async (_req, res) => {
    try {
      const connected = await checkConnection();
      const blockNumber = connected ? await getBlockNumber() : null;

      res.json({
        success: true,
        data: {
          status: connected ? 'healthy' : 'degraded',
          blockchain: {
            connected,
            blockNumber,
            chainId: config.chainId,
          },
        },
      });
    } catch {
      res.status(503).json({
        success: false,
        data: { status: 'unhealthy' },
      });
    }
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/dids', didRoutes);
  app.use('/api/credentials', credentialRoutes);
  app.use('/api/providers', providerCredentialRouter);
  app.use('/api/verifications', verificationRoutes);
  app.use('/api/admin', adminRoutes);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main() {
  // Validate configuration before doing anything else
  validateConfig();

  // Initialize database
  initializeDatabase();

  // Check blockchain connection
  const connected = await checkConnection();
  if (connected) {
    const blockNumber = await getBlockNumber();
    logger.info(`Blockchain connected at block ${blockNumber} via ${getSafeRpcUrl()}`);
  } else {
    logger.warn('Blockchain not available. Start Hardhat node and redeploy contracts.');
  }

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(`Backend API running on port ${config.port} (${config.nodeEnv})`);
  });

  // Graceful shutdown with timeout
  const shutdown = () => {
    logger.info('Shutting down...');

    const forceExit = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(() => {
      closeDatabase();
      clearTimeout(forceExit);
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Only start the server when this file is run directly (not imported by tests)
const isMainModule = require.main === module ||
  process.argv[1]?.endsWith('index.ts') ||
  process.argv[1]?.endsWith('index.js');

if (isMainModule) {
  main().catch((error) => {
    logger.error('Failed to start server', error);
    process.exit(1);
  });
}
