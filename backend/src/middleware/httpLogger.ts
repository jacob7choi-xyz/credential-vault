import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

export function httpLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    // Log path only -- exclude query params to avoid leaking sensitive data
    logger.log(level, `${req.method} ${req.path} ${res.statusCode} ${duration}ms`, {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      requestId: req.requestId,
    });
  });

  next();
}
