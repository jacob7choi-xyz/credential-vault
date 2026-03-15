import jwt from 'jsonwebtoken';
import { config } from '../src/config';
import { JwtPayload } from '../src/types';

export function signTestToken(payload: JwtPayload, expiresIn: string = '1h'): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn,
    issuer: 'credential-vault',
    audience: 'credential-vault-api',
  } as jwt.SignOptions);
}
