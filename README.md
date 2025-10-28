# Datto RMM Critical Alerts Notification System

A comprehensive full-stack application for monitoring critical alerts from Datto RMM and automatically notifying clients via email and SMS. This system transforms reactive IT support into proactive service delivery.

## Features

### Core Capabilities
- **Real-time Alert Monitoring**: Automatically polls Datto RMM API every 5 minutes for critical alerts
- **Intelligent Alert Classification**: Business rules engine determines alert priority based on configurable criteria
- **Multi-Channel Notifications**: Send alerts to clients via email and SMS
- **Interactive Dashboard**: Real-time web interface for monitoring and managing alerts
- **Alert Resolution Workflow**: Track resolution status, time to resolution, and root cause analysis
- **Notification Templates**: Customizable templates with dynamic variable substitution
- **Audit Logging**: Complete audit trail of all administrative actions
- **Queue Management**: Redis-backed Bull queue for reliable notification delivery with automatic retries

### Technical Highlights
- OAuth 2.0 authentication with Datto RMM API
- Rate limiting and circuit breaker pattern for API protection
- PostgreSQL database with full-text search capabilities
- JWT-based admin authentication
- Responsive React dashboard with Tailwind CSS
- Docker-based deployment for easy scaling

## Architecture

```
┌─────────────────┐
│  React Frontend │ (Port 80)
│   (Tailwind)    │
└────────┬────────┘
         │
    ┌────▼─────────────────┐
    │  Express Backend API │ (Port 3000)
    │  (Node.js/TypeScript)│
    └────┬─────────────┬───┘
         │             │
    ┌────▼────┐   ┌────▼─────┐
    │PostgreSQL│   │  Redis   │
    │    DB    │   │  Queue   │
    └──────────┘   └──────────┘
         │
    ┌────▼──────────────┐
    │   Datto RMM API   │
    │  (OAuth 2.0)      │
    └───────────────────┘
```

## Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL 14+
- **Cache/Queue**: Redis + Bull
- **Email**: Nodemailer (SMTP)
- **SMS**: Twilio API
- **Scheduling**: node-cron

### Frontend
- **Framework**: React 18
- **Language**: TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Routing**: React Router

### DevOps
- **Containerization**: Docker & Docker Compose
- **Web Server**: Nginx (frontend)
- **Process Management**: PM2 (optional)

## Prerequisites

- Docker and Docker Compose (recommended) **OR**
- Node.js 18+, PostgreSQL 14+, Redis 7+ (for manual setup)
- Datto RMM API credentials (API Key and Secret)
- SMTP server credentials for email notifications
- Twilio account for SMS notifications

## Quick Start with Docker

### 1. Clone the Repository

```bash
git clone <repository-url>
cd datto-rmm-notifier
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# Datto RMM API Configuration
DATTO_API_URL=https://pinotage-api.centrastage.net
DATTO_API_KEY=your_api_key_here
DATTO_API_SECRET=your_api_secret_here

# JWT Secret (generate a strong random string)
JWT_SECRET=your_secure_jwt_secret_here

# Email Configuration (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASSWORD=your_email_password
SMTP_FROM_EMAIL=alerts@example.com

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

### 3. Start the Application

```bash
docker-compose up -d
```

This will start:
- PostgreSQL database (port 5432)
- Redis cache (port 6379)
- Backend API (port 3000)
- Frontend web app (port 80)

### 4. Access the Dashboard

Open your browser and navigate to:
```
http://localhost
```

**Default Login Credentials:**
- Username: `admin`
- Password: `admin123`

**⚠️ IMPORTANT:** Change the default password immediately after first login!

### 5. Verify Setup

Check that all services are running:
```bash
docker-compose ps
```

View logs:
```bash
docker-compose logs -f backend
```

## Manual Installation (Without Docker)

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
# Edit .env with your configuration

# Set up database
psql -U postgres -d datto_rmm_notifier -f ../database/schema.sql

# Build TypeScript
npm run build

# Start the server
npm start
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# OR build for production
npm run build
```

### Database Setup

```bash
# Create database
createdb datto_rmm_notifier

# Run schema
psql -U postgres -d datto_rmm_notifier -f database/schema.sql
```

## Configuration

### Environment Variables

#### Server Configuration
- `PORT`: Backend server port (default: 3000)
- `NODE_ENV`: Environment (development/production)

#### Database Configuration
- `DB_HOST`: PostgreSQL host
- `DB_PORT`: PostgreSQL port (default: 5432)
- `DB_NAME`: Database name
- `DB_USER`: Database user
- `DB_PASSWORD`: Database password

#### Redis Configuration
- `REDIS_HOST`: Redis host
- `REDIS_PORT`: Redis port (default: 6379)
- `REDIS_PASSWORD`: Redis password (optional)

#### Datto RMM Configuration
- `DATTO_API_URL`: Datto RMM API base URL
- `DATTO_API_KEY`: Your API key
- `DATTO_API_SECRET`: Your API secret
- `DATTO_RATE_LIMIT_THRESHOLD`: Rate limit threshold (default: 540)

#### Alert Polling Configuration
- `POLLING_INTERVAL_MINUTES`: How often to poll for alerts (default: 5)
- `ALERT_RETENTION_DAYS`: How long to keep resolved alerts (default: 90)

#### Notification Configuration
- `NOTIFICATION_RETRY_ATTEMPTS`: Max retry attempts (default: 3)
- `NOTIFICATION_RETRY_DELAY_MS`: Delay between retries (default: 60000)

## API Documentation

### Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

### Key Endpoints

#### Authentication
- `POST /api/auth/login` - User login

#### Alerts
- `GET /api/alerts` - Get all alerts (with filtering and pagination)
- `GET /api/alerts/:id` - Get alert by ID
- `GET /api/alerts/stats` - Get dashboard statistics
- `POST /api/alerts/:id/resolve` - Resolve an alert
- `PATCH /api/alerts/:id/status` - Update alert status

#### Notifications
- `POST /api/notifications/send` - Send notifications
- `GET /api/notifications` - Get notification history
- `GET /api/notifications/queue-stats` - Get queue statistics

#### Contacts
- `GET /api/contacts` - Get all contacts
- `POST /api/contacts` - Create new contact
- `PUT /api/contacts/:id` - Update contact
- `DELETE /api/contacts/:id` - Delete contact

#### Templates
- `GET /api/templates` - Get notification templates
- `POST /api/templates` - Create template (admin only)
- `PUT /api/templates/:id` - Update template (admin only)

#### Admin
- `POST /api/admin/users` - Create admin user (admin only)
- `POST /api/admin/change-password` - Change password
- `POST /api/admin/polling/trigger` - Manually trigger alert polling
- `GET /api/admin/audit-logs` - Get audit logs (admin only)

## Alert Classification Rules

The system uses configurable business rules to determine alert priority. Default rules include:

### Critical Alerts
- **Device Offline**: Device offline for 5+ minutes
- **Disk Space**: Usage >90% or <5GB free
- **CPU Usage**: >95% for 10+ minutes
- **Memory Usage**: >90%
- **Antivirus**: Disabled or outdated >7 days
- **Ransomware**: Any ransomware detection
- **Critical Patches**: Missing patches with CVSS score >7.0

### Customization

Rules can be customized via the `alert_classification_rules` database table:

```sql
INSERT INTO alert_classification_rules
(rule_name, alert_type_pattern, priority, conditions, order_index)
VALUES
('Custom Rule', 'alert_type', 'critical', '{"key": "value"}', 10);
```

## Notification Templates

### Default Templates

The system includes pre-configured templates for:
1. **Critical Alert - Email**: Full HTML email with alert details
2. **Critical Alert - SMS**: Truncated 160-character SMS
3. **Alert Resolved - Email**: Resolution confirmation email

### Template Variables

Available variables for templates:
- `{{device_name}}` - Device name
- `{{site_name}}` - Site/client name
- `{{alert_type}}` - Alert type (formatted)
- `{{alert_time}}` - Alert timestamp
- `{{alert_details}}` - Extracted alert details
- `{{admin_message}}` - Custom administrator message
- `{{eta}}` - Estimated resolution time
- `{{support_phone}}` - Support phone number
- `{{support_email}}` - Support email
- `{{portal_link}}` - Portal URL
- `{{ticket_number}}` - Ticket/reference number

### Creating Custom Templates

1. Log into the dashboard
2. Navigate to Templates (admin only)
3. Click "Create Template"
4. Use variables with double curly braces: `{{variable_name}}`

## Database Schema

The application uses PostgreSQL with the following main tables:

- **alerts**: All alerts from Datto RMM
- **notifications**: Notification delivery records
- **contacts**: Client contact information
- **notification_templates**: Message templates
- **sites**: Client sites/organizations
- **devices**: Monitored devices
- **admin_users**: System administrators
- **audit_logs**: Action audit trail
- **alert_classification_rules**: Priority determination rules

Full schema: `database/schema.sql`

## Monitoring & Maintenance

### Health Check

```bash
curl http://localhost:3000/health
```

### Queue Monitoring

Check notification queue status:
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/notifications/queue-stats
```

### Logs

Backend logs are stored in `backend/logs/`:
- `error.log` - Error messages only
- `combined.log` - All log levels

View logs in Docker:
```bash
docker-compose logs -f backend
```

### Database Maintenance

Clean up old resolved alerts (runs automatically based on `ALERT_RETENTION_DAYS`):
```sql
DELETE FROM alerts
WHERE status = 'resolved'
AND resolved_at < NOW() - INTERVAL '90 days';
```

## Security Best Practices

1. **Change Default Password**: Immediately change the default `admin` password
2. **Use Strong JWT Secret**: Generate a secure random string for `JWT_SECRET`
3. **Enable HTTPS**: Use SSL/TLS certificates in production (nginx/Let's Encrypt)
4. **Secure Environment Variables**: Never commit `.env` files to version control
5. **Regular Updates**: Keep dependencies updated with `npm audit`
6. **Database Backups**: Regularly backup PostgreSQL database
7. **API Rate Limiting**: Configure appropriate rate limits for your use case
8. **Multi-Factor Authentication**: Enable MFA for admin accounts (configured in database)

## Troubleshooting

### Database Connection Issues

```bash
# Test PostgreSQL connection
docker-compose exec postgres psql -U postgres -d datto_rmm_notifier -c "SELECT NOW();"
```

### Redis Connection Issues

```bash
# Test Redis connection
docker-compose exec redis redis-cli ping
```

### Datto RMM API Issues

Check backend logs for authentication or rate limiting errors:
```bash
docker-compose logs backend | grep -i "datto"
```

Common issues:
- Invalid API credentials: Verify `DATTO_API_KEY` and `DATTO_API_SECRET`
- Rate limiting: API calls limited to 600 requests per 60 seconds
- Token expiration: Tokens refresh automatically after 90 hours

### Notification Delivery Issues

Check notification queue:
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/notifications/queue-stats
```

Common issues:
- **Email failures**: Verify SMTP credentials and server settings
- **SMS failures**: Check Twilio account balance and phone number format (E.164)
- **Queue stuck**: Restart Redis or clear failed jobs via API

## Development

### Running Tests

```bash
cd backend
npm test
```

### Code Linting

```bash
cd backend
npm run lint

cd ../frontend
npm run lint
```

### Database Migrations

The application uses a simple SQL schema file. To make schema changes:

1. Edit `database/schema.sql`
2. Create a new migration script in `database/migrations/`
3. Apply manually or through your migration tool

## Performance Optimization

### Recommended Settings

For production deployments handling 1000+ alerts:

- **Database**: Increase PostgreSQL `shared_buffers` and `work_mem`
- **Redis**: Enable persistence with RDB snapshots
- **Backend**: Use PM2 cluster mode with multiple instances
- **Rate Limiting**: Adjust based on Datto RMM tier limits
- **Caching**: Increase cache TTL for static data

### Scaling

Horizontal scaling options:
- Multiple backend instances behind a load balancer
- Read replicas for PostgreSQL
- Redis Sentinel for high availability
- CDN for frontend static assets

## Roadmap

Future enhancements planned:
- [ ] Mobile-responsive dashboard improvements
- [ ] Advanced analytics and reporting
- [ ] Client self-service portal
- [ ] Webhook support for third-party integrations
- [ ] Machine learning for alert prediction
- [ ] Multi-tenancy support
- [ ] Advanced notification rules engine
- [ ] Slack/Teams integration

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or feature requests:
- Create an issue on GitHub
- Contact: support@example.com

## Acknowledgments

- Built for Managed Service Providers (MSPs)
- Integrates with Datto RMM (Kaseya)
- Inspired by the need for proactive client communication

---

**Version**: 1.0.0
**Last Updated**: October 2025
**Author**: MSP Development Team
