import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

interface Config {
  server: {
    port: number;
    nodeEnv: string;
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  dattoRmm: {
    apiUrl: string;
    apiKey: string;
    apiSecret: string;
    rateLimitThreshold: number;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  email: {
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      password: string;
    };
    from: {
      name: string;
      email: string;
    };
  };
  twilio: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
    rateLimitPerClient: number;
  };
  polling: {
    intervalMinutes: number;
  };
  alerts: {
    retentionDays: number;
  };
  notifications: {
    retryAttempts: number;
    retryDelayMs: number;
  };
  support: {
    phone: string;
    email: string;
    portalUrl: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

const config: Config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'datto_rmm_notifier',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
  dattoRmm: {
    apiUrl: process.env.DATTO_API_URL || 'https://pinotage-api.centrastage.net',
    apiKey: process.env.DATTO_API_KEY || '',
    apiSecret: process.env.DATTO_API_SECRET || '',
    rateLimitThreshold: parseInt(process.env.DATTO_RATE_LIMIT_THRESHOLD || '540', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'change-this-secret-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '30m',
  },
  email: {
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      password: process.env.SMTP_PASSWORD || '',
    },
    from: {
      name: process.env.SMTP_FROM_NAME || 'Datto RMM Alerts',
      email: process.env.SMTP_FROM_EMAIL || 'alerts@example.com',
    },
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    rateLimitPerClient: parseInt(process.env.SMS_RATE_LIMIT_PER_CLIENT || '10', 10),
  },
  polling: {
    intervalMinutes: parseInt(process.env.POLLING_INTERVAL_MINUTES || '5', 10),
  },
  alerts: {
    retentionDays: parseInt(process.env.ALERT_RETENTION_DAYS || '90', 10),
  },
  notifications: {
    retryAttempts: parseInt(process.env.NOTIFICATION_RETRY_ATTEMPTS || '3', 10),
    retryDelayMs: parseInt(process.env.NOTIFICATION_RETRY_DELAY_MS || '60000', 10),
  },
  support: {
    phone: process.env.SUPPORT_PHONE || '+1-555-0100',
    email: process.env.SUPPORT_EMAIL || 'support@example.com',
    portalUrl: process.env.PORTAL_URL || 'https://alerts.example.com',
  },
  rateLimit: {
    windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
};

export default config;
