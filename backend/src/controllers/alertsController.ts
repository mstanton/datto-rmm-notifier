import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import db from '../config/database';
import logger from '../utils/logger';
import dattoRmmService from '../services/dattoRmmService';
import {
  Alert,
  AlertsFilterParams,
  PaginatedResponse,
  ResolveAlertRequest,
  DashboardStats,
} from '../../../shared/types';

export class AlertsController {
  // Get all alerts with filtering and pagination
  public async getAlerts(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        site_name,
        device_name,
        alert_type,
        status,
        priority,
        date_from,
        date_to,
        search,
        page = 1,
        limit = 50,
        sort_by = 'detected_at',
        sort_order = 'desc',
      } = req.query as Partial<AlertsFilterParams>;

      const offset = ((page as number) - 1) * (limit as number);

      // Build WHERE clause
      const conditions: string[] = ['1=1'];
      const params: any[] = [];
      let paramIndex = 1;

      if (site_name) {
        conditions.push(`s.site_name ILIKE $${paramIndex}`);
        params.push(`%${site_name}%`);
        paramIndex++;
      }

      if (device_name) {
        conditions.push(`d.device_name ILIKE $${paramIndex}`);
        params.push(`%${device_name}%`);
        paramIndex++;
      }

      if (alert_type) {
        conditions.push(`a.alert_type = $${paramIndex}`);
        params.push(alert_type);
        paramIndex++;
      }

      if (status) {
        conditions.push(`a.status = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }

      if (priority) {
        conditions.push(`a.priority = $${paramIndex}`);
        params.push(priority);
        paramIndex++;
      }

      if (date_from) {
        conditions.push(`a.detected_at >= $${paramIndex}`);
        params.push(date_from);
        paramIndex++;
      }

      if (date_to) {
        conditions.push(`a.detected_at <= $${paramIndex}`);
        params.push(date_to);
        paramIndex++;
      }

      if (search) {
        conditions.push(`(
          a.alert_message ILIKE $${paramIndex} OR
          a.alert_type ILIKE $${paramIndex} OR
          d.device_name ILIKE $${paramIndex} OR
          s.site_name ILIKE $${paramIndex}
        )`);
        params.push(`%${search}%`);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM alerts a
        LEFT JOIN devices d ON a.device_id = d.id
        LEFT JOIN sites s ON a.site_id = s.id
        WHERE ${whereClause}
      `;

      const countResult = await db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total, 10);

      // Get alerts
      const alertsQuery = `
        SELECT
          a.*,
          d.device_name, d.device_uid, d.hostname,
          s.site_name, s.site_uid, s.company_name
        FROM alerts a
        LEFT JOIN devices d ON a.device_id = d.id
        LEFT JOIN sites s ON a.site_id = s.id
        WHERE ${whereClause}
        ORDER BY a.${sort_by} ${sort_order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);
      const alertsResult = await db.query<Alert>(alertsQuery, params);

      const response: PaginatedResponse<Alert> = {
        data: alertsResult.rows,
        total,
        page: page as number,
        limit: limit as number,
        total_pages: Math.ceil(total / (limit as number)),
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to fetch alerts', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch alerts' });
    }
  }

  // Get single alert by ID
  public async getAlertById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const query = `
        SELECT
          a.*,
          d.device_name, d.device_uid, d.hostname, d.device_type,
          s.site_name, s.site_uid, s.company_name
        FROM alerts a
        LEFT JOIN devices d ON a.device_id = d.id
        LEFT JOIN sites s ON a.site_id = s.id
        WHERE a.id = $1
      `;

      const result = await db.query<Alert>(query, [id]);

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Not Found', message: 'Alert not found' });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error(`Failed to fetch alert ${req.params.id}`, error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch alert' });
    }
  }

  // Get dashboard statistics
  public async getDashboardStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Total alerts
      const totalAlertsResult = await db.query('SELECT COUNT(*) as count FROM alerts');
      const total_alerts = parseInt(totalAlertsResult.rows[0].count, 10);

      // Critical alerts
      const criticalAlertsResult = await db.query(
        "SELECT COUNT(*) as count FROM alerts WHERE priority = 'critical' AND status = 'open'"
      );
      const critical_alerts = parseInt(criticalAlertsResult.rows[0].count, 10);

      // Open alerts
      const openAlertsResult = await db.query("SELECT COUNT(*) as count FROM alerts WHERE status = 'open'");
      const open_alerts = parseInt(openAlertsResult.rows[0].count, 10);

      // Resolved today
      const resolvedTodayResult = await db.query(
        "SELECT COUNT(*) as count FROM alerts WHERE status = 'resolved' AND resolved_at >= CURRENT_DATE"
      );
      const resolved_today = parseInt(resolvedTodayResult.rows[0].count, 10);

      // Notifications sent today
      const notificationsTodayResult = await db.query(
        'SELECT COUNT(*) as count FROM notifications WHERE created_at >= CURRENT_DATE'
      );
      const notifications_sent_today = parseInt(notificationsTodayResult.rows[0].count, 10);

      // Average resolution time
      const avgResolutionResult = await db.query(
        'SELECT AVG(time_to_resolution_minutes) as avg FROM alerts WHERE time_to_resolution_minutes IS NOT NULL'
      );
      const avg_resolution_time_minutes = parseFloat(avgResolutionResult.rows[0].avg || 0);

      // Alerts by type
      const alertsByTypeResult = await db.query(`
        SELECT alert_type, COUNT(*) as count
        FROM alerts
        WHERE status = 'open'
        GROUP BY alert_type
        ORDER BY count DESC
        LIMIT 10
      `);

      // Alerts by site
      const alertsBySiteResult = await db.query(`
        SELECT s.site_name, COUNT(*) as count
        FROM alerts a
        LEFT JOIN sites s ON a.site_id = s.id
        WHERE a.status = 'open'
        GROUP BY s.site_name
        ORDER BY count DESC
        LIMIT 10
      `);

      const stats: DashboardStats = {
        total_alerts,
        critical_alerts,
        open_alerts,
        resolved_today,
        notifications_sent_today,
        avg_resolution_time_minutes,
        alerts_by_type: alertsByTypeResult.rows,
        alerts_by_site: alertsBySiteResult.rows,
      };

      res.json(stats);
    } catch (error) {
      logger.error('Failed to fetch dashboard stats', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch statistics' });
    }
  }

  // Resolve alert
  public async resolveAlert(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        resolution_notes,
        resolution_actions,
        root_cause,
        follow_up_required,
        notify_client,
        notification_message,
      } = req.body as ResolveAlertRequest;

      // Get alert
      const alertResult = await db.query('SELECT * FROM alerts WHERE id = $1', [id]);

      if (alertResult.rows.length === 0) {
        res.status(404).json({ error: 'Not Found', message: 'Alert not found' });
        return;
      }

      const alert = alertResult.rows[0];

      // Calculate time to resolution
      const detectedAt = new Date(alert.detected_at);
      const resolvedAt = new Date();
      const timeToResolutionMinutes = Math.floor((resolvedAt.getTime() - detectedAt.getTime()) / 60000);

      // Update alert in database
      await db.query(
        `UPDATE alerts SET
          status = 'resolved',
          resolved_at = NOW(),
          resolution_notes = $1,
          resolution_actions = $2,
          root_cause = $3,
          time_to_resolution_minutes = $4,
          follow_up_required = $5,
          updated_at = NOW()
        WHERE id = $6`,
        [resolution_notes, resolution_actions, root_cause, timeToResolutionMinutes, follow_up_required, id]
      );

      // Resolve in Datto RMM
      try {
        await dattoRmmService.resolveAlert(alert.alert_uid);
      } catch (error) {
        logger.error(`Failed to resolve alert ${alert.alert_uid} in Datto RMM`, error);
        // Continue even if Datto RMM resolution fails
      }

      // Create audit log
      await db.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, changes)
        VALUES ($1, $2, $3, $4, $5)`,
        [
          req.user?.id,
          'resolve_alert',
          'alert',
          id,
          JSON.stringify({ resolution_notes, resolution_actions, root_cause }),
        ]
      );

      logger.info(`Alert ${id} resolved by user ${req.user?.username}`);

      res.json({
        success: true,
        message: 'Alert resolved successfully',
        time_to_resolution_minutes: timeToResolutionMinutes,
      });
    } catch (error) {
      logger.error(`Failed to resolve alert ${req.params.id}`, error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to resolve alert' });
    }
  }

  // Update alert status
  public async updateAlertStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;

      await db.query('UPDATE alerts SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);

      // Create audit log
      await db.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, changes)
        VALUES ($1, $2, $3, $4, $5)`,
        [req.user?.id, 'update_alert_status', 'alert', id, JSON.stringify({ status })]
      );

      res.json({ success: true, message: 'Alert status updated' });
    } catch (error) {
      logger.error(`Failed to update alert status ${req.params.id}`, error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update alert status' });
    }
  }
}

export default new AlertsController();
