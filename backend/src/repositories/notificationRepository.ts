import { Notification } from '../types/models';
import db from '../config/database';

class NotificationRepository {
  /**
   * Create a new notification
   */
  async create(notification: Omit<Notification, 'id' | 'created_at' | 'updated_at'>): Promise<Notification> {
    const result = await db.query<Notification>(
      `INSERT INTO notifications (
        alert_id, contact_id, type, template_name, subject, message, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        notification.alert_id,
        notification.contact_id,
        notification.type,
        notification.template_name,
        notification.subject,
        notification.message,
        notification.status,
      ]
    );

    return result.rows[0];
  }

  /**
   * Find notification by ID
   */
  async findById(id: string): Promise<Notification | null> {
    const result = await db.query<Notification>(
      'SELECT * FROM notifications WHERE id = $1',
      [id]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all notifications for an alert
   */
  async findByAlertId(alertId: string): Promise<Notification[]> {
    const result = await db.query<Notification>(
      `SELECT * FROM notifications
       WHERE alert_id = $1
       ORDER BY created_at DESC`,
      [alertId]
    );

    return result.rows;
  }

  /**
   * Get all notifications with filtering
   */
  async findAll(filters: {
    alertId?: string;
    contactId?: string;
    type?: string;
    status?: string[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ notifications: Notification[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (filters.alertId) {
      conditions.push(`alert_id = $${paramCount}`);
      values.push(filters.alertId);
      paramCount++;
    }

    if (filters.contactId) {
      conditions.push(`contact_id = $${paramCount}`);
      values.push(filters.contactId);
      paramCount++;
    }

    if (filters.type) {
      conditions.push(`type = $${paramCount}`);
      values.push(filters.type);
      paramCount++;
    }

    if (filters.status && filters.status.length > 0) {
      conditions.push(`status = ANY($${paramCount})`);
      values.push(filters.status);
      paramCount++;
    }

    if (filters.startDate) {
      conditions.push(`created_at >= $${paramCount}`);
      values.push(filters.startDate);
      paramCount++;
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramCount}`);
      values.push(filters.endDate);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as count FROM notifications ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const result = await db.query<Notification>(
      `SELECT n.*, c.name as contact_name, c.email, c.phone
       FROM notifications n
       JOIN contacts c ON n.contact_id = c.id
       ${whereClause}
       ORDER BY n.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...values, limit, offset]
    );

    return { notifications: result.rows, total };
  }

  /**
   * Update notification status
   */
  async updateStatus(
    id: string,
    status: 'queued' | 'sent' | 'delivered' | 'failed',
    errorMessage?: string
  ): Promise<Notification | null> {
    const updates: string[] = ['status = $1', 'delivery_attempts = delivery_attempts + 1'];
    const values: any[] = [status];
    let paramCount = 2;

    if (status === 'sent') {
      updates.push(`sent_at = $${paramCount}`);
      values.push(new Date());
      paramCount++;
    }

    if (status === 'delivered') {
      updates.push(`delivered_at = $${paramCount}`);
      values.push(new Date());
      paramCount++;
    }

    if (status === 'failed' && errorMessage) {
      updates.push(`error_message = $${paramCount}`);
      values.push(errorMessage);
      paramCount++;
    }

    values.push(id);

    const result = await db.query<Notification>(
      `UPDATE notifications SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  /**
   * Get pending notifications (queued status)
   */
  async getPendingNotifications(limit = 100): Promise<Notification[]> {
    const result = await db.query<Notification>(
      `SELECT * FROM notifications
       WHERE status = 'queued'
       AND delivery_attempts < 3
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Get notification statistics
   */
  async getStatistics(startDate?: Date, endDate?: Date): Promise<{
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    emailCount: number;
    smsCount: number;
  }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (startDate) {
      conditions.push(`created_at >= $${paramCount}`);
      values.push(startDate);
      paramCount++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramCount}`);
      values.push(endDate);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE type = 'email') as email_count,
        COUNT(*) FILTER (WHERE type = 'sms') as sms_count
       FROM notifications ${whereClause}`,
      values
    );

    const row = result.rows[0];

    return {
      total: parseInt(row.total),
      sent: parseInt(row.sent),
      delivered: parseInt(row.delivered),
      failed: parseInt(row.failed),
      emailCount: parseInt(row.email_count),
      smsCount: parseInt(row.sms_count),
    };
  }
}

export default new NotificationRepository();
