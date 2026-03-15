import { Request } from 'express';

const MAX_LIMIT = 100;
const MAX_OFFSET = 10000;
const DEFAULT_LIMIT = 50;

export interface PaginationParams {
  limit: number;
  offset: number;
}

export function parsePagination(req: Request): PaginationParams {
  const rawLimit = parseInt(req.query.limit as string, 10);
  const rawOffset = parseInt(req.query.offset as string, 10);

  const limit = isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_LIMIT : Math.min(rawLimit, MAX_LIMIT);
  const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : Math.min(rawOffset, MAX_OFFSET);

  return { limit, offset };
}
