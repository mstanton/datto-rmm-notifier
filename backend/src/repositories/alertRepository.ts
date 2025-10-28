import { Alert } from '../types/models';
import db from '../config/database';
import logger from '../config/logger';

class AlertRepository {
  /**
   * Create a new alert
   */
  async create(alert: Omit<Alert, 'id' | 'created_at' | 'updated_at'>): Promise<Alert | null> {
    try {
      const result = await db.query<Alert>(
        `INSERT INTO alerts (
          alert_uid, device_uid, device_name, site_uid, site_name,
          alert_type, alert_message, alert_context, alert_date,
          priority, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          alert.alert_uid,
          alert.device_uid,
          alert.device_name,
          alert.site_uid,
          alert.site_name,
          alert.alert_type,
          alert.alert_message,
          JSON.stringify(alert.alert_context),
          alert.alert_date,
          alert.priority,
          alert.status,
        ]
      );

      return result.rows[0];
    } catch (error: any) {
      // Handle duplicate alert_uid (unique constraint)
      if (error.code === '23505') {
        logger.debug(`Alert ${alert.alert_uid} already exists`);
        return null;
      }
      logger.error('Error creating alert:', error);
      throw error;
    }
  }

  /**
   * Find alert by alert_uid
   */
  async findByAlertUid(alertUid: string): Promise<Alert | null> {
    const result = await db.query<Alert>(
      'SELECT * FROM alerts WHERE alert_uid = $1',
      [alertUid]
    );

    return result.rows[0] || null;
  }

  /**
   * Find alert by ID
   */
  async findById(id: string): Promise<Alert | null> {
    const result = await db.query<Alert>(
      'SELECT * FROM alerts WHERE id = $1',
      [id]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all alerts with filtering
   */
  async findAll(filters: {
    status?: string[];
    priority?: string[];
    siteUid?: string;
    deviceUid?: string;
    alertType?: string;
    startDate?: Date;
    endDate?: Date;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ alerts: Alert[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (filters.status && filters.status.length > 0) {
      conditions.push(`status = ANY($${paramCount})`);
      values.push(filters.status);
      paramCount++;
    }

    if (filters.priority && filters.priority.length > 0) {
      conditions.push(`priority = ANY($${paramCount})`);
      values.push(filters.priority);
      paramCount++;
    }

    if (filters.siteUid) {
      conditions.push(`site_uid = $${paramCount}`);
      values.push(filters.siteUid);
      paramCount++;
    }

    if (filters.deviceUid) {
      conditions.push(`device_uid = $${paramCount}`);
      values.push(filters.deviceUid);
      paramCount++;
    }

    if (filters.alertType) {
      conditions.push(`alert_type = $${paramCount}`);
      values.push(filters.alertType);
      paramCount++;
    }

    if (filters.startDate) {
      conditions.push(`alert_date >= $${paramCount}`);
      values.push(filters.startDate);
      paramCount++;
    }

    if (filters.endDate) {
      conditions.push(`alert_date <= $${paramCount}`);
      values.push(filters.endDate);
      paramCount++;
    }

    if (filters.search) {
      conditions.push(`(
        device_name ILIKE $${paramCount} OR
        site_name ILIKE $${paramCount} OR
        alert_type ILIKE $${paramCount} OR
        alert_message ILIKE $${paramCount}
      )`);
      values.push(`%${filters.search}%`);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as count FROM alerts ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const result = await db.query<Alert>(
      `SELECT * FROM alerts ${whereClause}
       ORDER BY alert_date DESC, created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...values, limit, offset]
    );

    return { alerts: result.rows, total };
  }

  /**
   * Get critical alerts (open or notified, critical priority)
   */
  async findCriticalAlerts(): Promise<Alert[]> {
    const result = await db.query<Alert>(
      `SELECT * FROM alerts
       WHERE priority = 'critical'
       AND status IN ('open', 'notified')
       ORDER BY alert_date DESC`,
      []
    );

    return result.rows;
  }

  /**
   * Update alert status
   */
  async updateStatus(
    alertUid: string,
    status: 'open' | 'notified' | 'resolved',
    resolutionNotes?: string
  ): Promise<Alert | null> {
    const updates: string[] = ['status = $1'];
    const values: any[] = [status];
    let paramCount = 2;

    if (status === 'notified') {
      updates.push(`notified_at = $${paramCount}`);
      values.push(new Date());
      paramCount++;
    }

    if (status === 'resolved') {
      updates.push(`resolved_at = $${paramCount}`);
      values.push(new Date());
      paramCount++;

      if (resolutionNotes) {
        updates.push(`resolution_notes = $${paramCount}`);
        values.push(resolutionNotes);
        paramCount++;
      }
    }

    values.push(alertUid);

    const result = await db.query<Alert>(
      `UPDATE alerts SET ${updates.join(', ')}
       WHERE alert_uid = $${paramCount}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  /**
   * Get alert statistics
   */
  async getStatistics(siteUid?: string): Promise<{
    total: number;
    critical: number;
    open: number;
    notified: number;
    resolved: number;
  }> {
    const siteFilter = siteUid ? 'WHERE site_uid = $1' : '';
    const params = siteUid ? [siteUid] : [];

    const result = await db.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE priority = 'critical') as critical,
        COUNT(*) FILTER (WHERE status = 'open') as open,
        COUNT(*) FILTER (WHERE status = 'notified') as notified,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved
       FROM alerts ${siteFilter}`,
      params
    );

    const row = result.rows[0];

    return {
      total: parseInt(row.total),
      critical: parseInt(row.critical),
      open: parseInt(row.open),
      notified: parseInt(row.notified),
      resolved: parseInt(row.resolved),
    };
  }

  /**
   * Delete old resolved alerts (for data retention)
   */
  async deleteOldResolvedAlerts(daysToKeep = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await db.query(
      `DELETE FROM alerts
       WHERE status = 'resolved'
       AND resolved_at < $1`,
      [cutoffDate]
    );

    logger.info(`Deleted ${result.rowCount} old resolved alerts`);
    return result.rowCount || 0;
  }
}

export default new AlertRepository();
