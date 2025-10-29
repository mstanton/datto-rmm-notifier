# Datto RMM Critical Alerts Notification System

A comprehensive notification system that monitors critical alerts from Datto RMM and enables instant client communication via SMS and email. Built with Node.js, Express, React, PostgreSQL, and Redis.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Real-time Alert Monitoring**: Automatically polls Datto RMM API every 5 minutes for critical alerts
- **Multi-channel Notifications**: Send alerts via email (SMTP) and SMS (Twilio)
- **Priority Classification**: Intelligent alert classification based on configurable business rules
- **Admin Dashboard**: Modern React-based interface with filtering, search, and real-time updates
- **Notification Queue**: Reliable delivery with Bull/Redis and automatic retry logic
- **Template System**: Customizable notification templates with dynamic variables
- **Client Contact Management**: Organize and manage client contacts with notification preferences
- **Alert Resolution Workflow**: Track resolution status and documentation
- **Comprehensive Audit Logging**: Complete trail of all notifications and actions

## Architecture

```
┌─────────────────┐
│  React Frontend │ ← Admin Dashboard
└────────┬────────┘
         │
    ┌────▼────────────┐
    │  Express API    │ ← RESTful API
    └────┬────────────┘
         │
    ┌────▼──────────────────────────┐
    │  Services Layer               │
    ├───────────────────────────────┤
    │ • Datto API (OAuth 2.0)      │
    │ • Alert Classifier            │
    │ • Email Service (Nodemailer) │
    │ • SMS Service (Twilio)       │
    │ • Notification Queue (Bull)  │
    │ • Alert Poller (Cron)        │
    └────┬──────────────────────────┘
         │
    ┌────▼────────────┐
    │   PostgreSQL    │ ← Data Storage
    │     Redis       │ ← Queue & Cache
    └─────────────────┘
```

## Prerequisites

- **Node.js** 18+ and npm 9+
- **PostgreSQL** 14+
- **Redis** 7+
- **Datto RMM Account** with API access
- **SMTP Server** (Gmail, SendGrid, etc.)
- **Twilio Account** (for SMS notifications)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/datto-rmm-notifier.git
cd datto-rmm-notifier
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Datto RMM API
DATTO_API_URL=https://pinotage-api.centrastage.net
DATTO_API_KEY=your_api_key
DATTO_API_SECRET_KEY=your_secret_key

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=Datto Alerts <alerts@yourcompany.com>

# SMS (Twilio)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+15551234567

# Database
DB_PASSWORD=your_secure_password
REDIS_PASSWORD=your_redis_password
```

### 3. Start with Docker Compose (Recommended)

```bash
docker-compose up -d
```

This will start:
- PostgreSQL database (port 5432)
- Redis (port 6379)
- Backend API (port 3000)
- Frontend (port 5173)

Access the dashboard at **http://localhost:5173**

### 4. Manual Installation

#### Backend

```bash
cd backend
npm install
npm run build
npm start
```

#### Frontend

```bash
cd frontend
npm install
npm run build
npm run preview
```

#### Database Setup

```bash
psql -U postgres -d datto_rmm_notifier -f database/schema.sql
```

## Configuration

### Datto RMM API Setup

1. Log in to your Datto RMM account
2. Navigate to **Settings → API**
3. Generate API Key and Secret Key
4. Add to `.env` file

### Email Configuration

#### Gmail

1. Enable 2-Factor Authentication
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use app password in `SMTP_PASSWORD`

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_16_char_app_password
```

#### SendGrid

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your_sendgrid_api_key
```

### SMS Configuration (Twilio)

1. Sign up at https://www.twilio.com
2. Get Account SID and Auth Token from Dashboard
3. Purchase a phone number
4. Add credentials to `.env`

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+15551234567
```

### Alert Classification Rules

The system uses configurable rules in the `alert_rules` table. Default rules:

| Alert Type | Condition | Priority |
|------------|-----------|----------|
| Device Offline | > 5 minutes | Critical |
| Disk Usage | > 90% or < 5GB free | Critical |
| CPU Usage | > 95% for 10+ min | Critical |
| Memory Usage | > 90% | Critical |
| Antivirus Disabled | Any | Critical |
| Ransomware | Any | Critical |
| Critical Patches | CVSS > 7.0 | Critical |

## Usage

### Admin Dashboard

**Access**: http://localhost:5173

#### View Alerts

- **Real-time Updates**: Refreshes every 30 seconds
- **Filtering**: By status (open/notified/resolved), priority, site, date
- **Search**: Full-text search across devices, sites, and alert types

#### Send Notifications

1. Click **Bell icon** on any alert
2. Select recipients from site contacts
3. Choose notification type (Email/SMS/Both)
4. Add custom message (optional)
5. Click **Send Notification**

#### Resolve Alerts

1. Click **Check icon** on alert
2. Add resolution notes
3. Alert marked resolved in both dashboard and Datto RMM

### API Endpoints

#### Alerts

```bash
# Get all alerts
GET /api/alerts?status=open&priority=critical&page=1&limit=50

# Get single alert
GET /api/alerts/:id

# Get critical alerts
GET /api/alerts/critical

# Resolve alert
POST /api/alerts/:id/resolve
{
  "resolutionNotes": "Replaced failed drive"
}

# Manual poll
POST /api/alerts/poll

# Get statistics
GET /api/alerts/statistics
```

#### Contacts

```bash
# Get all contacts
GET /api/contacts?siteUid=xxx&active=true

# Get contacts by site
GET /api/contacts/site/:siteUid

# Create contact
POST /api/contacts
{
  "siteUid": "xxx",
  "siteName": "Acme Corp",
  "name": "John Doe",
  "email": "john@acme.com",
  "phone": "+15551234567",
  "notificationPreferences": {
    "email": true,
    "sms": true
  }
}

# Update contact
PUT /api/contacts/:id

# Delete contact
DELETE /api/contacts/:id
```

#### Notifications

```bash
# Send notification
POST /api/notifications/alert/:alertId
{
  "contactIds": ["contact-id-1", "contact-id-2"],
  "type": "both",
  "customMessage": "Working on resolution, ETA 2 hours"
}

# Get notifications
GET /api/notifications?alertId=xxx&status=delivered

# Get queue statistics
GET /api/notifications/queue-stats
```

## Development

### Backend Development

```bash
cd backend
npm install
npm run dev  # Runs with nodemon and ts-node
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev  # Runs Vite dev server on port 5173
```

### Type Checking

```bash
# Backend
cd backend
npm run lint

# Frontend
cd frontend
npm run type-check
```

## Production Deployment

### Docker Compose (Recommended)

```bash
# Build and start all services
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Environment-specific Configuration

```bash
# Production
NODE_ENV=production docker-compose up -d

# Disable auto-polling (manual refresh only)
ENABLE_POLLING=false docker-compose up -d
```

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Connect to database
docker-compose exec postgres psql -U postgres -d datto_rmm_notifier

# Verify schema
\dt
```

### Datto API Authentication

```bash
# Test API connection
curl -X POST https://pinotage-api.centrastage.net/auth/oauth/token \
  -u "API_KEY:SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"grant_type": "client_credentials"}'
```

## Project Structure

```
datto-rmm-notifier/
├── backend/                 # Node.js/Express backend
│   ├── src/
│   │   ├── config/         # Database, Redis, Logger config
│   │   ├── controllers/    # API controllers
│   │   ├── services/       # Business logic services
│   │   ├── repositories/   # Data access layer
│   │   ├── routes/         # Express routes
│   │   ├── types/          # TypeScript types
│   │   ├── middleware/     # Express middleware
│   │   └── index.ts        # Application entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── frontend/               # React/TypeScript frontend
│   ├── src/
│   │   ├── api/           # API client
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── types/         # TypeScript types
│   │   └── main.tsx       # Application entry point
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── Dockerfile
├── database/
│   └── schema.sql         # PostgreSQL schema
├── docker-compose.yml     # Docker orchestration
├── .env.example           # Environment template
└── README.md             # This file
```

## License

This project is licensed under the MIT License.

## Acknowledgments

- Built with [Express](https://expressjs.com/)
- Frontend powered by [React](https://react.dev/) and [Vite](https://vitejs.dev/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Email delivery by [Nodemailer](https://nodemailer.com/)
- SMS delivery by [Twilio](https://www.twilio.com/)
- Queue management by [Bull](https://github.com/OptimalBits/bull)

---

**Version**: 1.0.0
**Last Updated**: October 2025
