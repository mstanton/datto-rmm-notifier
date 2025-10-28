import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import logger from '../utils/logger';
import { AdminUser } from '../../../shared/types';

export interface AuthRequest extends Request {
  user?: AdminUser;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized', message: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, config.jwt.secret) as any;

    req.user = {
      id: decoded.id,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role,
      is_active: decoded.is_active,
      first_name: decoded.first_name,
      last_name: decoded.last_name,
      mfa_enabled: decoded.mfa_enabled,
      created_at: new Date(decoded.created_at),
      updated_at: new Date(decoded.updated_at),
    };

    next();
  } catch (error) {
    logger.error('Authentication failed', error);
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
      return;
    }

    next();
  };
};
