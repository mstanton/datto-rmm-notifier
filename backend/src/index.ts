import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import config from './config';
import logger from './utils/logger';
import db from './config/database';
import alertPollingService from './services/alertPollingService';
import notificationQueue from './queues/notificationQueue';

// Controllers
import authController from './controllers/authController';
import alertsController from './controllers/alertsController';
import notificationsController from './controllers/notificationsController';

// Middleware
import { authenticate, authorize } from './middleware/auth';

class Server {
  private app: Application;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // CORS
    this.app.use(cors());

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.maxRequests,
      message: 'Too many requests from this IP, please try again later',
    });
    this.app.use('/api', limiter);

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.debug(`${req.method} ${req.path}`, {
        query: req.query,
        ip: req.ip,
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // API base route
    this.app.get('/api', (req: Request, res: Response) => {
      res.json({
        name: 'Datto RMM Critical Alerts Notification System API',
        version: '1.0.0',
        status: 'running',
      });
    });

    // Auth routes (no authentication required)
    this.app.post('/api/auth/login', authController.login.bind(authController));

    // Protected routes - require authentication
    const router = express.Router();
    router.use(authenticate);

    // Alerts routes
    router.get('/alerts', alertsController.getAlerts.bind(alertsController));
    router.get('/alerts/stats', alertsController.getDashboardStats.bind(alertsController));
    router.get('/alerts/:id', alertsController.getAlertById.bind(alertsController));
    router.post('/alerts/:id/resolve', alertsController.resolveAlert.bind(alertsController));
    router.patch('/alerts/:id/status', alertsController.updateAlertStatus.bind(alertsController));

    // Notifications routes
    router.post('/notifications/send', notificationsController.sendNotifications.bind(notificationsController));
    router.get('/notifications', notificationsController.getNotifications.bind(notificationsController));
    router.get('/notifications/queue-stats', notificationsController.getQueueStats.bind(notificationsController));

    // Contacts routes
    router.get('/contacts', this.getContacts.bind(this));
    router.post('/contacts', this.createContact.bind(this));
    router.put('/contacts/:id', this.updateContact.bind(this));
    router.delete('/contacts/:id', this.deleteContact.bind(this));

    // Templates routes
    router.get('/templates', this.getTemplates.bind(this));
    router.get('/templates/:id', this.getTemplateById.bind(this));
    router.post('/templates', authorize('admin').bind(this), this.createTemplate.bind(this));
    router.put('/templates/:id', authorize('admin').bind(this), this.updateTemplate.bind(this));

    // Sites routes
    router.get('/sites', this.getSites.bind(this));

    // Admin routes (admin only)
    router.post('/admin/users', authorize('admin').bind(this), authController.createUser.bind(authController));
    router.post('/admin/change-password', authController.changePassword.bind(authController));
    router.post('/admin/polling/trigger', authorize('admin').bind(this), this.triggerPolling.bind(this));
    router.get('/admin/audit-logs', authorize('admin').bind(this), this.getAuditLogs.bind(this));

    this.app.use('/api', router);

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({ error: 'Not Found', message: 'Route not found' });
    });
  }

  private setupErrorHandling(): void {
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Unhandled error', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: config.server.nodeEnv === 'development' ? err.message : 'An error occurred',
      });
    });
  }

  // Additional route handlers

  private async getContacts(req: Request, res: Response): Promise<void> {
    try {
      const { site_id } = req.query;
      let query = 'SELECT c.*, s.site_name FROM contacts c LEFT JOIN sites s ON c.site_id = s.id WHERE 1=1';
      const params: any[] = [];

      if (site_id) {
        query += ' AND c.site_id = $1';
        params.push(site_id);
      }

      query += ' ORDER BY c.is_primary DESC, c.last_name, c.first_name';

      const result = await db.query(query, params);
      res.json(result.rows);
    } catch (error) {
      logger.error('Failed to fetch contacts', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  private async createContact(req: Request, res: Response): Promise<void> {
    try {
      const { site_id, first_name, last_name, email, phone, role, is_primary } = req.body;

      const result = await db.query(
        `INSERT INTO contacts (site_id, first_name, last_name, email, phone, role, is_primary)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [site_id, first_name, last_name, email, phone, role, is_primary || false]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create contact', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  private async updateContact(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { first_name, last_name, email, phone, role, is_primary, email_notifications_enabled, sms_notifications_enabled } = req.body;

      const result = await db.query(
        `UPDATE contacts SET
          first_name = $1, last_name = $2, email = $3, phone = $4, role = $5,
          is_primary = $6, email_notifications_enabled = $7, sms_notifications_enabled = $8,
          updated_at = NOW()
        WHERE id = $9
        RETURNING *`,
        [first_name, last_name, email, phone, role, is_primary, email_notifications_enabled, sms_notifications_enabled, id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Not Found' });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Failed to update contact', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  private async deleteContact(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await db.query('DELETE FROM contacts WHERE id = $1', [id]);
      res.json({ success: true, message: 'Contact deleted' });
    } catch (error) {
      logger.error('Failed to delete contact', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  private async getTemplates(req: Request, res: Response): Promise<void> {
    try {
      const result = await db.query('SELECT * FROM notification_templates WHERE is_active = true ORDER BY template_name');
      res.json(result.rows);
    } catch (error) {
      logger.error('Failed to fetch templates', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  private async getTemplateById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const result = await db.query('SELECT * FROM notification_templates WHERE id = $1', [id]);

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Not Found' });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Failed to fetch template', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  private async createTemplate(req: Request, res: Response): Promise<void> {
    try {
      const { template_name, template_type, subject, body_text, body_html, is_default } = req.body;

      const result = await db.query(
        `INSERT INTO notification_templates (template_name, template_type, subject, body_text, body_html, is_default)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [template_name, template_type, subject, body_text, body_html, is_default || false]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create template', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  private async updateTemplate(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { template_name, subject, body_text, body_html, is_default, is_active } = req.body;

      const result = await db.query(
        `UPDATE notification_templates SET
          template_name = $1, subject = $2, body_text = $3, body_html = $4,
          is_default = $5, is_active = $6, updated_at = NOW()
        WHERE id = $7
        RETURNING *`,
        [template_name, subject, body_text, body_html, is_default, is_active, id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Not Found' });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Failed to update template', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  private async getSites(req: Request, res: Response): Promise<void> {
    try {
      const result = await db.query('SELECT * FROM sites ORDER BY site_name');
      res.json(result.rows);
    } catch (error) {
      logger.error('Failed to fetch sites', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  private async triggerPolling(req: Request, res: Response): Promise<void> {
    try {
      if (alertPollingService.isCurrentlyPolling()) {
        res.status(409).json({ error: 'Conflict', message: 'Polling already in progress' });
        return;
      }

      alertPollingService.manualPoll();
      res.json({ success: true, message: 'Manual polling triggered' });
    } catch (error) {
      logger.error('Failed to trigger polling', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  private async getAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 100, offset = 0 } = req.query;

      const result = await db.query(
        `SELECT al.*, au.username, au.email
        FROM audit_logs al
        LEFT JOIN admin_users au ON al.user_id = au.id
        ORDER BY al.created_at DESC
        LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      res.json(result.rows);
    } catch (error) {
      logger.error('Failed to fetch audit logs', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  public async start(): Promise<void> {
    try {
      // Start alert polling service
      alertPollingService.start();

      // Start Express server
      this.app.listen(config.server.port, () => {
        logger.info(`Server running on port ${config.server.port} in ${config.server.nodeEnv} mode`);
      });
    } catch (error) {
      logger.error('Failed to start server', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    alertPollingService.stop();
    await notificationQueue.close();
    await db.close();
    logger.info('Server stopped');
  }
}

// Start server
const server = new Server();
server.start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

export default server;
