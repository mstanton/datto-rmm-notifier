// Shared TypeScript types for Datto RMM Notifier

export interface Site {
  id: string;
  site_uid: string;
  site_name: string;
  company_name?: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Device {
  id: string;
  device_uid: string;
  site_id: string;
  device_name: string;
  device_type?: string;
  hostname?: string;
  domain?: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

export type AlertStatus = 'open' | 'notified' | 'resolved';
export type AlertPriority = 'critical' | 'high' | 'medium' | 'low';
export type AlertType =
  | 'online_offline_status_ctx'
  | 'perf_disk_usage_ctx'
  | 'perf_resource_usage_ctx'
  | 'antivirus_ctx'
  | 'patch_ctx'
  | 'ransomware_ctx'
  | 'eventlog_ctx'
  | 'srvc_status_ctx'
  | 'process_status_ctx';

export interface Alert {
  id: string;
  alert_uid: string;
  device_id?: string;
  site_id?: string;
  alert_type: string;
  priority: AlertPriority;
  status: AlertStatus;
  alert_message?: string;
  alert_context?: Record<string, any>;
  alert_source_info?: Record<string, any>;
  diagnostics?: string;
  ticket_number?: string;
  detected_at?: Date;
  resolved_at?: Date;
  resolution_notes?: string;
  resolution_actions?: string;
  root_cause?: string;
  time_to_resolution_minutes?: number;
  follow_up_required: boolean;
  created_at: Date;
  updated_at: Date;
  // Joined data
  device?: Device;
  site?: Site;
}

export interface Contact {
  id: string;
  site_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  role?: string;
  is_primary: boolean;
  email_notifications_enabled: boolean;
  sms_notifications_enabled: boolean;
  sms_opt_out: boolean;
  created_at: Date;
  updated_at: Date;
}

export type NotificationType = 'email' | 'sms';
export type NotificationStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export interface Notification {
  id: string;
  alert_id: string;
  contact_id?: string;
  notification_type: NotificationType;
  template_id?: string;
  recipient_email?: string;
  recipient_phone?: string;
  subject?: string;
  message_body: string;
  status: NotificationStatus;
  delivery_status_detail?: string;
  retry_count: number;
  external_message_id?: string;
  sent_at?: Date;
  delivered_at?: Date;
  failed_at?: Date;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
  // Joined data
  alert?: Alert;
  contact?: Contact;
}

export type TemplateType = 'email' | 'sms' | 'both';

export interface NotificationTemplate {
  id: string;
  template_name: string;
  template_type: TemplateType;
  subject?: string;
  body_text: string;
  body_html?: string;
  is_default: boolean;
  is_active: boolean;
  variables?: string[];
  created_at: Date;
  updated_at: Date;
}

export type AdminRole = 'admin' | 'technician' | 'readonly';

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: AdminRole;
  is_active: boolean;
  last_login_at?: Date;
  mfa_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  changes?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
  // Joined data
  user?: AdminUser;
}

export interface AlertClassificationRule {
  id: string;
  rule_name: string;
  alert_type_pattern: string;
  priority: AlertPriority;
  conditions: Record<string, any>;
  is_active: boolean;
  order_index: number;
  created_at: Date;
  updated_at: Date;
}

// API Request/Response Types

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: Omit<AdminUser, 'password_hash'>;
}

export interface AlertsFilterParams {
  site_name?: string;
  device_name?: string;
  alert_type?: string;
  status?: AlertStatus;
  priority?: AlertPriority;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface SendNotificationRequest {
  alert_ids: string[];
  template_id: string;
  notification_types: NotificationType[];
  custom_message?: string;
  recipient_overrides?: {
    contact_id: string;
    email?: string;
    phone?: string;
  }[];
  eta?: string;
  ticket_number?: string;
}

export interface ResolveAlertRequest {
  alert_id: string;
  resolution_notes: string;
  resolution_actions: string;
  root_cause?: string;
  follow_up_required: boolean;
  notify_client: boolean;
  notification_message?: string;
}

export interface DashboardStats {
  total_alerts: number;
  critical_alerts: number;
  open_alerts: number;
  resolved_today: number;
  notifications_sent_today: number;
  avg_resolution_time_minutes: number;
  alerts_by_type: {
    alert_type: string;
    count: number;
  }[];
  alerts_by_site: {
    site_name: string;
    count: number;
  }[];
}

// Datto RMM API Types

export interface DattoAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface DattoAlert {
  alertUid: string;
  alertMessage: string;
  alertContext: Record<string, any>;
  alertSourceInfo: {
    deviceUid?: string;
    siteUid?: string;
    siteName?: string;
    deviceName?: string;
  };
  diagnostics?: string;
  ticketNumber?: string;
  priority?: string;
}

export interface DattoDevice {
  deviceUid: string;
  deviceName: string;
  deviceType: string;
  hostname?: string;
  domain?: string;
  description?: string;
  siteUid: string;
}

export interface DattoSite {
  siteUid: string;
  siteName: string;
  companyName?: string;
  description?: string;
}

// Template Variables
export interface TemplateVariables {
  device_name: string;
  site_name: string;
  alert_type: string;
  alert_time: string;
  alert_details: string;
  admin_message: string;
  eta: string;
  support_phone: string;
  support_email: string;
  portal_link: string;
  ticket_number: string;
}

// Notification Queue Job Data
export interface NotificationJobData {
  notification_id: string;
  notification_type: NotificationType;
  recipient: string;
  subject?: string;
  message_body: string;
  alert_id: string;
}

// Error Response
export interface ErrorResponse {
  error: string;
  message: string;
  details?: any;
}
