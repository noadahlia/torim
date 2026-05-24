import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

const secret = process.env.JWT_SECRET || 'dev-secret-key';
const expiryTime = process.env.JWT_EXPIRY || '7d';

export interface JWTPayload {
  userId: string;
  email: string;
  role: 'CLIENT' | 'PROFESSIONAL' | 'ADMIN';
}

export const generateToken = (payload: JWTPayload): string => {
  try {
    return jwt.sign(payload, secret, {
      expiresIn: expiryTime,
      algorithm: 'HS256',
    });
  } catch (error) {
    logger.error('Failed to generate JWT', error);
    throw new Error('Token generation failed');
  }
};

export const verifyToken = (token: string): JWTPayload => {
  try {
    return jwt.verify(token, secret, {
      algorithms: ['HS256'],
    }) as JWTPayload;
  } catch (error) {
    logger.error('Failed to verify JWT', error);
    throw new Error('Invalid token');
  }
};

export const decodeToken = (token: string): any => {
  return jwt.decode(token);
};

export default { generateToken, verifyToken, decodeToken };
