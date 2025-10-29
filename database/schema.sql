-- Datto RMM Critical Alerts Notification System
-- Database Schema v1.0

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'technician', 'readonly')),
    active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alerts table
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_uid VARCHAR(255) UNIQUE NOT NULL,
    device_uid VARCHAR(255) NOT NULL,
    device_name VARCHAR(255) NOT NULL,
    site_uid VARCHAR(255) NOT NULL,
    site_name VARCHAR(255) NOT NULL,
    alert_type VARCHAR(100) NOT NULL,
    alert_message TEXT NOT NULL,
    alert_context JSONB NOT NULL,
    alert_date TIMESTAMP NOT NULL,
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('open', 'notified', 'resolved')),
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notified_at TIMESTAMP,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contacts table
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_uid VARCHAR(255) NOT NULL,
    site_name VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(100),
    notification_preferences JSONB DEFAULT '{"email": true, "sms": false}'::jsonb,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification templates table
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('email', 'sms')),
    subject VARCHAR(255),
    body TEXT NOT NULL,
    variables TEXT[] DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL CHECK (type IN ('email', 'sms')),
    template_name VARCHAR(255),
    subject VARCHAR(255),
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
    delivery_attempts INTEGER DEFAULT 0,
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alert rules table
CREATE TABLE alert_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    alert_type VARCHAR(100) NOT NULL,
    conditions JSONB NOT NULL,
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    auto_notify BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    changes JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_alerts_alert_uid ON alerts(alert_uid);
CREATE INDEX idx_alerts_device_uid ON alerts(device_uid);
CREATE INDEX idx_alerts_site_uid ON alerts(site_uid);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_priority ON alerts(priority);
CREATE INDEX idx_alerts_alert_date ON alerts(alert_date DESC);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);

CREATE INDEX idx_contacts_site_uid ON contacts(site_uid);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_active ON contacts(active);

CREATE INDEX idx_notifications_alert_id ON notifications(alert_id);
CREATE INDEX idx_notifications_contact_id ON notifications(contact_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Full-text search index for alerts
CREATE INDEX idx_alerts_search ON alerts USING gin(to_tsvector('english',
    device_name || ' ' || site_name || ' ' || alert_type || ' ' || alert_message
));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_rules_updated_at BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default notification templates
INSERT INTO notification_templates (name, type, subject, body, variables) VALUES
(
    'critical_alert_email',
    'email',
    'CRITICAL ALERT: {{alert_type}} - {{device_name}}',
    '<html>
    <body>
        <h2 style="color: #d32f2f;">Critical Alert Detected</h2>
        <p><strong>Device:</strong> {{device_name}}</p>
        <p><strong>Site:</strong> {{site_name}}</p>
        <p><strong>Alert Type:</strong> {{alert_type}}</p>
        <p><strong>Time:</strong> {{alert_time}}</p>
        <p><strong>Details:</strong> {{alert_details}}</p>
        {{#if admin_message}}
        <p><strong>Message from IT:</strong> {{admin_message}}</p>
        {{/if}}
        {{#if eta}}
        <p><strong>Estimated Resolution:</strong> {{eta}}</p>
        {{/if}}
        <hr>
        <p>Support Contact: {{support_phone}} | {{support_email}}</p>
    </body>
    </html>',
    ARRAY['device_name', 'site_name', 'alert_type', 'alert_time', 'alert_details', 'admin_message', 'eta', 'support_phone', 'support_email']
),
(
    'critical_alert_sms',
    'sms',
    NULL,
    'CRITICAL: {{device_name}} - {{alert_type}}. {{#if eta}}ETA: {{eta}}.{{/if}} Contact: {{support_phone}}',
    ARRAY['device_name', 'alert_type', 'eta', 'support_phone']
),
(
    'resolution_email',
    'email',
    'RESOLVED: {{alert_type}} - {{device_name}}',
    '<html>
    <body>
        <h2 style="color: #388e3c;">Alert Resolved</h2>
        <p><strong>Device:</strong> {{device_name}}</p>
        <p><strong>Site:</strong> {{site_name}}</p>
        <p><strong>Alert Type:</strong> {{alert_type}}</p>
        <p><strong>Resolved At:</strong> {{resolution_time}}</p>
        {{#if resolution_notes}}
        <p><strong>Resolution Summary:</strong> {{resolution_notes}}</p>
        {{/if}}
        <p>The issue has been successfully resolved. No further action is required.</p>
        <hr>
        <p>Support Contact: {{support_phone}} | {{support_email}}</p>
    </body>
    </html>',
    ARRAY['device_name', 'site_name', 'alert_type', 'resolution_time', 'resolution_notes', 'support_phone', 'support_email']
),
(
    'resolution_sms',
    'sms',
    NULL,
    'RESOLVED: {{device_name}} - {{alert_type}}. Issue fixed. Contact: {{support_phone}}',
    ARRAY['device_name', 'alert_type', 'support_phone']
);

-- Insert default alert rules
INSERT INTO alert_rules (name, alert_type, conditions, priority, auto_notify, active) VALUES
(
    'Device Offline Critical',
    'online_offline_status_ctx',
    '{"status": "offline", "min_duration_minutes": 5}'::jsonb,
    'critical',
    true,
    true
),
(
    'Disk Usage Critical',
    'perf_disk_usage_ctx',
    '{"min_usage_percent": 90, "min_free_gb": 5}'::jsonb,
    'critical',
    false,
    true
),
(
    'CPU Usage Critical',
    'perf_resource_usage_ctx',
    '{"resource_type": "cpu", "min_usage_percent": 95, "min_duration_minutes": 10}'::jsonb,
    'critical',
    false,
    true
),
(
    'Memory Usage Critical',
    'perf_resource_usage_ctx',
    '{"resource_type": "memory", "min_usage_percent": 90}'::jsonb,
    'critical',
    false,
    true
),
(
    'Antivirus Disabled',
    'antivirus_ctx',
    '{"status": "disabled"}'::jsonb,
    'critical',
    true,
    true
),
(
    'Ransomware Detection',
    'ransomware_ctx',
    '{}'::jsonb,
    'critical',
    true,
    true
),
(
    'Critical Patches Missing',
    'patch_ctx',
    '{"min_cvss_score": 7.0}'::jsonb,
    'critical',
    false,
    true
);

-- Create default admin user (password: admin123 - CHANGE IN PRODUCTION!)
-- Hash generated with bcrypt rounds=10
INSERT INTO users (username, email, password_hash, role) VALUES
(
    'admin',
    'admin@example.com',
    '$2b$10$rZYJvKp5xGKXvHqJhVjWje8xEqbQJYxGhqK0O1Y5XqFZKHgT.UQPS',
    'admin'
);
