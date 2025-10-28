import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/database';
import config from '../config';
import logger from '../utils/logger';
import { LoginRequest, LoginResponse, AdminUser } from '../../../shared/types';

export class AuthController {
  // User login
  public async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body as LoginRequest;

      if (!username || !password) {
        res.status(400).json({ error: 'Bad Request', message: 'Username and password required' });
        return;
      }

      // Get user from database
      const result = await db.query<AdminUser & { password_hash: string }>(
        'SELECT * FROM admin_users WHERE username = $1 AND is_active = true',
        [username]
      );

      if (result.rows.length === 0) {
        res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
        return;
      }

      const user = result.rows[0];

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
        return;
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          is_active: user.is_active,
          first_name: user.first_name,
          last_name: user.last_name,
          mfa_enabled: user.mfa_enabled,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      // Update last login
      await db.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = $1', [user.id]);

      // Remove password hash from response
      const { password_hash, ...userWithoutPassword } = user;

      const response: LoginResponse = {
        token,
        user: userWithoutPassword,
      };

      logger.info(`User ${username} logged in successfully`);

      res.json(response);
    } catch (error) {
      logger.error('Login failed', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Login failed' });
    }
  }

  // Create new admin user (admin only)
  public async createUser(req: Request, res: Response): Promise<void> {
    try {
      const { username, email, password, first_name, last_name, role } = req.body;

      if (!username || !email || !password) {
        res.status(400).json({ error: 'Bad Request', message: 'Username, email, and password required' });
        return;
      }

      // Check if user already exists
      const existingUser = await db.query(
        'SELECT id FROM admin_users WHERE username = $1 OR email = $2',
        [username, email]
      );

      if (existingUser.rows.length > 0) {
        res.status(409).json({ error: 'Conflict', message: 'Username or email already exists' });
        return;
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 10);

      // Insert user
      const result = await db.query(
        `INSERT INTO admin_users (username, email, password_hash, first_name, last_name, role)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, username, email, first_name, last_name, role, is_active, created_at`,
        [username, email, password_hash, first_name, last_name, role || 'technician']
      );

      logger.info(`New user created: ${username}`);

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        user: result.rows[0],
      });
    } catch (error) {
      logger.error('Failed to create user', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create user' });
    }
  }

  // Change password
  public async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const { current_password, new_password } = req.body;
      const userId = (req as any).user?.id;

      if (!current_password || !new_password) {
        res.status(400).json({ error: 'Bad Request', message: 'Current and new password required' });
        return;
      }

      // Get user
      const result = await db.query<{ password_hash: string }>(
        'SELECT password_hash FROM admin_users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Not Found', message: 'User not found' });
        return;
      }

      // Verify current password
      const isValid = await bcrypt.compare(current_password, result.rows[0].password_hash);

      if (!isValid) {
        res.status(401).json({ error: 'Unauthorized', message: 'Current password is incorrect' });
        return;
      }

      // Hash new password
      const new_password_hash = await bcrypt.hash(new_password, 10);

      // Update password
      await db.query('UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
        new_password_hash,
        userId,
      ]);

      logger.info(`Password changed for user ${userId}`);

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      logger.error('Failed to change password', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to change password' });
    }
  }
}

export default new AuthController();
