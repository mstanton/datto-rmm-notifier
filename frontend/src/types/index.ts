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
  alert_date: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'notified' | 'resolved';
  detected_at: string;
  notified_at?: string;
  resolved_at?: string;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
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
  sent_at?: string;
  delivered_at?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface AlertFilters {
  status?: string[];
  priority?: string[];
  siteUid?: string;
  deviceUid?: string;
  alertType?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface Statistics {
  total: number;
  critical: number;
  open: number;
  notified: number;
  resolved: number;
}
