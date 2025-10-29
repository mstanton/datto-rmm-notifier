// Database Models

export interface Alert {
  id: string;
  alert_uid: string;
  device_uid: string;
  device_name: string;
  site_uid: string;
  site_name: string;
  alert_type: string;
  alert_message: string;
  alert_context: Record<string, any>;
  alert_date: Date;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'notified' | 'resolved';
  detected_at: Date;
  notified_at?: Date;
  resolved_at?: Date;
  resolution_notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Contact {
  id: string;
  site_uid: string;
  site_name: string;
  name: string;
  email: string;
  phone?: string;
  role?: string;
  notification_preferences: {
    email: boolean;
    sms: boolean;
  };
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Notification {
  id: string;
  alert_id: string;
  contact_id: string;
  type: 'email' | 'sms';
  template_name: string;
  subject?: string;
  message: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  delivery_attempts: number;
  sent_at?: Date;
  delivered_at?: Date;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  type: 'email' | 'sms';
  subject?: string;
  body: string;
  variables: string[];
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  changes: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'technician' | 'readonly';
  active: boolean;
  last_login?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface AlertRule {
  id: string;
  name: string;
  alert_type: string;
  conditions: Record<string, any>;
  priority: 'critical' | 'high' | 'medium' | 'low';
  auto_notify: boolean;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}
