-- Datto RMM Critical Alerts Notification System
-- Database Schema Version 1.0

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sites Table (Datto RMM Client Sites)
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_uid VARCHAR(255) UNIQUE NOT NULL,
    site_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Devices Table
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_uid VARCHAR(255) UNIQUE NOT NULL,
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    device_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(100),
    hostname VARCHAR(255),
    domain VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alerts Table
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_uid VARCHAR(255) UNIQUE NOT NULL,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
    alert_type VARCHAR(100) NOT NULL,
    priority VARCHAR(50) NOT NULL DEFAULT 'medium',
    status VARCHAR(50) NOT NULL DEFAULT 'open', -- open, notified, resolved
    alert_message TEXT,
    alert_context JSONB,
    alert_source_info JSONB,
    diagnostics TEXT,
    ticket_number VARCHAR(100),
    detected_at TIMESTAMP,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    resolution_actions TEXT,
    root_cause TEXT,
    time_to_resolution_minutes INTEGER,
    follow_up_required BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contacts Table (Client Contacts)
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    role VARCHAR(100),
    is_primary BOOLEAN DEFAULT false,
    email_notifications_enabled BOOLEAN DEFAULT true,
    sms_notifications_enabled BOOLEAN DEFAULT true,
    sms_opt_out BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification Templates Table
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_name VARCHAR(255) UNIQUE NOT NULL,
    template_type VARCHAR(50) NOT NULL, -- email, sms, both
    subject VARCHAR(500), -- for email only
    body_text TEXT NOT NULL,
    body_html TEXT, -- for email only
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    variables JSONB, -- list of available variables
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications Table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    notification_type VARCHAR(50) NOT NULL, -- email, sms
    template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
    recipient_email VARCHAR(255),
    recipient_phone VARCHAR(20),
    subject VARCHAR(500),
    message_body TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'queued', -- queued, sent, delivered, failed
    delivery_status_detail TEXT,
    retry_count INTEGER DEFAULT 0,
    external_message_id VARCHAR(255), -- Twilio SID or email message ID
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    failed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Users Table
CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) NOT NULL DEFAULT 'technician', -- admin, technician, readonly
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP,
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_secret VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs Table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100), -- alert, notification, contact, etc.
    entity_id UUID,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alert Classification Rules Table
CREATE TABLE alert_classification_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_name VARCHAR(255) NOT NULL,
    alert_type_pattern VARCHAR(255) NOT NULL,
    priority VARCHAR(50) NOT NULL,
    conditions JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System Settings Table
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(255) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50), -- string, number, boolean, json
    description TEXT,
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes for Performance
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_priority ON alerts(priority);
CREATE INDEX idx_alerts_detected_at ON alerts(detected_at DESC);
CREATE INDEX idx_alerts_device_id ON alerts(device_id);
CREATE INDEX idx_alerts_site_id ON alerts(site_id);
CREATE INDEX idx_alerts_alert_uid ON alerts(alert_uid);
CREATE INDEX idx_notifications_alert_id ON notifications(alert_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_contacts_site_id ON contacts(site_id);
CREATE INDEX idx_devices_site_id ON devices(site_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Full-Text Search Indexes
CREATE INDEX idx_alerts_search ON alerts USING gin(to_tsvector('english',
    coalesce(alert_message, '') || ' ' ||
    coalesce(alert_type, '') || ' ' ||
    coalesce(diagnostics, '')));

-- Update Timestamp Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply Update Timestamp Triggers
CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_classification_rules_updated_at BEFORE UPDATE ON alert_classification_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert Default Alert Classification Rules
INSERT INTO alert_classification_rules (rule_name, alert_type_pattern, priority, conditions, order_index) VALUES
    ('Offline Device Critical', 'online_offline_status_ctx', 'critical',
     '{"offline_duration_minutes": 5}', 1),
    ('Disk Usage Critical', 'perf_disk_usage_ctx', 'critical',
     '{"usage_percent_threshold": 90, "free_gb_threshold": 5}', 2),
    ('CPU Usage Critical', 'perf_resource_usage_ctx', 'critical',
     '{"cpu_percent_threshold": 95, "duration_minutes": 10}', 3),
    ('Memory Usage Critical', 'perf_resource_usage_ctx', 'critical',
     '{"memory_percent_threshold": 90}', 4),
    ('Antivirus Disabled', 'antivirus_ctx', 'critical',
     '{"status": "disabled"}', 5),
    ('Ransomware Detection', 'ransomware_ctx', 'critical',
     '{}', 6),
    ('Critical Patches Missing', 'patch_ctx', 'critical',
     '{"cvss_score_threshold": 7.0}', 7);

-- Insert Default Notification Templates
INSERT INTO notification_templates (template_name, template_type, subject, body_text, body_html, is_default) VALUES
    ('Critical Alert - Email', 'email', 'CRITICAL ALERT: {{alert_type}} - {{device_name}}',
     'Critical Alert Detected\n\nDevice: {{device_name}}\nSite: {{site_name}}\nAlert Type: {{alert_type}}\nTime: {{alert_time}}\n\nDetails: {{alert_details}}\n\n{{admin_message}}\n\nEstimated Resolution: {{eta}}\n\nFor assistance, contact:\nPhone: {{support_phone}}\nEmail: {{support_email}}\n\nTicket: {{ticket_number}}',
     '<html><body style="font-family: Arial, sans-serif;"><h2 style="color: #d32f2f;">Critical Alert Detected</h2><table style="border-collapse: collapse; width: 100%;"><tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Device:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{device_name}}</td></tr><tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Site:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{site_name}}</td></tr><tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Alert Type:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{alert_type}}</td></tr><tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Time:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{alert_time}}</td></tr></table><div style="margin: 20px 0; padding: 15px; background-color: #f5f5f5; border-left: 4px solid #d32f2f;"><strong>Details:</strong><br>{{alert_details}}</div><div style="margin: 20px 0; padding: 15px; background-color: #e3f2fd; border-left: 4px solid #2196f3;">{{admin_message}}</div><p><strong>Estimated Resolution:</strong> {{eta}}</p><hr><p><strong>For assistance, contact:</strong><br>Phone: {{support_phone}}<br>Email: {{support_email}}</p><p><strong>Ticket:</strong> {{ticket_number}}</p></body></html>',
     true),
    ('Critical Alert - SMS', 'sms', NULL,
     'CRITICAL: {{device_name}} - {{alert_type}}. ETA {{eta}}. Contact: {{support_phone}}. Ticket: {{ticket_number}}',
     NULL, true),
    ('Alert Resolved - Email', 'email', 'RESOLVED: {{alert_type}} - {{device_name}}',
     'Alert Resolved\n\nDevice: {{device_name}}\nSite: {{site_name}}\nAlert Type: {{alert_type}}\nResolved: {{alert_time}}\n\nResolution Summary:\n{{admin_message}}\n\nThe issue has been resolved and services are operating normally.\n\nTicket: {{ticket_number}}',
     '<html><body style="font-family: Arial, sans-serif;"><h2 style="color: #388e3c;">Alert Resolved</h2><table style="border-collapse: collapse; width: 100%;"><tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Device:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{device_name}}</td></tr><tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Site:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{site_name}}</td></tr><tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Alert Type:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{alert_type}}</td></tr><tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Resolved:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{alert_time}}</td></tr></table><div style="margin: 20px 0; padding: 15px; background-color: #e8f5e9; border-left: 4px solid #388e3c;"><strong>Resolution Summary:</strong><br>{{admin_message}}</div><p>The issue has been resolved and services are operating normally.</p><p><strong>Ticket:</strong> {{ticket_number}}</p></body></html>',
     false);

-- Insert Default Admin User (password: admin123 - CHANGE IN PRODUCTION)
-- Password hash for 'admin123' using bcrypt
INSERT INTO admin_users (username, email, password_hash, first_name, last_name, role) VALUES
    ('admin', 'admin@example.com', '$2a$10$rqLWJI2JvVvKJqK3XhZkWeDN5RbvFYfOr3hgLTLxDJXq5K5BHKaui', 'System', 'Administrator', 'admin');

COMMENT ON TABLE alerts IS 'Stores all alerts retrieved from Datto RMM API';
COMMENT ON TABLE notifications IS 'Tracks all notifications sent to clients';
COMMENT ON TABLE contacts IS 'Client contacts for notifications';
COMMENT ON TABLE audit_logs IS 'Audit trail of all administrative actions';
