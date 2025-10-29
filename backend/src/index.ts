import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import alertPoller from './services/alertPoller';
import logger from './config/logger';
import db from './config/database';

// Load environment variables
dotenv.config();

class Server {
  private app: Application;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000');

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware() {
    // Security middleware
    this.app.use(helmet());

    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use(requestLogger);
  }

  /**
   * Setup routes
   */
  private setupRoutes() {
    // API routes
    this.app.use('/api', routes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        message: 'Datto RMM Critical Alerts Notification System',
        version: '1.0.0',
        endpoints: {
          health: '/api/health',
          alerts: '/api/alerts',
          contacts: '/api/contacts',
          notifications: '/api/notifications',
        },
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
      });
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling() {
    this.app.use(errorHandler);
  }

  /**
   * Test database connection
   */
  private async testDatabaseConnection(): Promise<boolean> {
    try {
      const result = await db.query('SELECT NOW()');
      logger.info('Database connection successful');
      return true;
    } catch (error) {
      logger.error('Database connection failed:', error);
      return false;
    }
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Test database connection
      const dbConnected = await this.testDatabaseConnection();
      if (!dbConnected) {
        logger.error('Cannot start server without database connection');
        process.exit(1);
      }

      // Start Express server
      this.app.listen(this.port, () => {
        logger.info(`Server started on port ${this.port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });

      // Start alert polling service
      if (process.env.ENABLE_POLLING !== 'false') {
        alertPoller.start();
        logger.info('Alert polling service enabled');
      } else {
        logger.info('Alert polling service disabled');
      }

      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  private async shutdown() {
    logger.info('Shutting down gracefully...');

    // Stop alert polling
    alertPoller.stop();

    // Close database connection
    await db.end();

    logger.info('Server shut down complete');
    process.exit(0);
  }
}

// Start the server
const server = new Server();
server.start();

export default server;
