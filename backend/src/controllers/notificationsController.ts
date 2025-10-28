import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import db from '../config/database';
import logger from '../utils/logger';
import notificationQueue from '../queues/notificationQueue';
import config from '../config';
import {
  SendNotificationRequest,
  NotificationJobData,
  TemplateVariables,
  NotificationTemplate,
  Contact,
} from '../../../shared/types';

export class NotificationsController {
  // Send notifications for alerts
  public async sendNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        alert_ids,
        template_id,
        notification_types,
        custom_message,
        recipient_overrides,
        eta,
        ticket_number,
      } = req.body as SendNotificationRequest;

      if (!alert_ids || alert_ids.length === 0) {
        res.status(400).json({ error: 'Bad Request', message: 'alert_ids required' });
        return;
      }

      // Get template
      const templateResult = await db.query<NotificationTemplate>(
        'SELECT * FROM notification_templates WHERE id = $1 AND is_active = true',
        [template_id]
      );

      if (templateResult.rows.length === 0) {
        res.status(404).json({ error: 'Not Found', message: 'Template not found' });
        return;
      }

      const template = templateResult.rows[0];

      let notificationsCreated = 0;

      // Process each alert
      for (const alert_id of alert_ids) {
        // Get alert with related data
        const alertResult = await db.query(
          `SELECT a.*, d.device_name, s.site_name, s.id as site_id
          FROM alerts a
          LEFT JOIN devices d ON a.device_id = d.id
          LEFT JOIN sites s ON a.site_id = s.id
          WHERE a.id = $1`,
          [alert_id]
        );

        if (alertResult.rows.length === 0) {
          logger.warn(`Alert ${alert_id} not found, skipping`);
          continue;
        }

        const alert = alertResult.rows[0];

        // Get contacts for this site
        const contactsResult = await db.query<Contact>(
          'SELECT * FROM contacts WHERE site_id = $1 AND (email_notifications_enabled = true OR sms_notifications_enabled = true)',
          [alert.site_id]
        );

        const contacts = contactsResult.rows;

        if (contacts.length === 0) {
          logger.warn(`No contacts found for site ${alert.site_id}, skipping alert ${alert_id}`);
          continue;
        }

        // Prepare template variables
        const variables: Partial<TemplateVariables> = {
          device_name: alert.device_name || 'Unknown Device',
          site_name: alert.site_name || 'Unknown Site',
          alert_type: this.formatAlertType(alert.alert_type),
          alert_time: new Date(alert.detected_at).toLocaleString(),
          alert_details: this.extractAlertDetails(alert.alert_context),
          admin_message: custom_message || '',
          eta: eta || 'TBD',
          support_phone: config.support.phone,
          support_email: config.support.email,
          portal_link: config.support.portalUrl,
          ticket_number: ticket_number || alert.ticket_number || 'N/A',
        };

        // Send notifications to each contact
        for (const contact of contacts) {
          // Email notification
          if (
            notification_types.includes('email') &&
            contact.email &&
            contact.email_notifications_enabled &&
            (template.template_type === 'email' || template.template_type === 'both')
          ) {
            const notification_id = await this.createNotificationRecord(
              alert_id,
              contact.id,
              'email',
              template_id,
              contact.email,
              null,
              template.subject || '',
              template.body_text,
              template.body_html
            );

            // Add to queue
            const jobData: NotificationJobData = {
              notification_id,
              notification_type: 'email',
              recipient: contact.email,
              subject: this.renderTemplate(template.subject || '', variables),
              message_body: template.body_html
                ? this.renderTemplate(template.body_html, variables)
                : this.renderTemplate(template.body_text, variables),
              alert_id,
            };

            await notificationQueue.addEmailNotification(jobData);
            notificationsCreated++;
          }

          // SMS notification
          if (
            notification_types.includes('sms') &&
            contact.phone &&
            contact.sms_notifications_enabled &&
            !contact.sms_opt_out &&
            (template.template_type === 'sms' || template.template_type === 'both')
          ) {
            // Use SMS template if available
            const smsTemplateResult = await db.query<NotificationTemplate>(
              "SELECT * FROM notification_templates WHERE template_type = 'sms' AND is_default = true",
              []
            );

            const smsTemplate =
              smsTemplateResult.rows.length > 0 ? smsTemplateResult.rows[0] : template;

            const notification_id = await this.createNotificationRecord(
              alert_id,
              contact.id,
              'sms',
              smsTemplate.id,
              null,
              contact.phone,
              '',
              smsTemplate.body_text,
              null
            );

            // Add to queue
            const jobData: NotificationJobData = {
              notification_id,
              notification_type: 'sms',
              recipient: contact.phone,
              message_body: this.renderTemplate(smsTemplate.body_text, variables),
              alert_id,
            };

            await notificationQueue.addSmsNotification(jobData);
            notificationsCreated++;
          }
        }

        // Update alert status to 'notified'
        await db.query("UPDATE alerts SET status = 'notified', updated_at = NOW() WHERE id = $1", [
          alert_id,
        ]);
      }

      // Create audit log
      await db.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, changes)
        VALUES ($1, $2, $3, $4, $5)`,
        [
          req.user?.id,
          'send_notifications',
          'notification',
          null,
          JSON.stringify({ alert_ids, notification_types, notifications_created: notificationsCreated }),
        ]
      );

      logger.info(`Created ${notificationsCreated} notifications for ${alert_ids.length} alerts`);

      res.json({
        success: true,
        message: `${notificationsCreated} notifications queued for delivery`,
        notifications_created: notificationsCreated,
      });
    } catch (error) {
      logger.error('Failed to send notifications', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to send notifications' });
    }
  }

  // Get notification history
  public async getNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { alert_id, status, limit = 100, offset = 0 } = req.query;

      let query = `
        SELECT n.*, a.alert_type, a.alert_message, c.first_name, c.last_name
        FROM notifications n
        LEFT JOIN alerts a ON n.alert_id = a.id
        LEFT JOIN contacts c ON n.contact_id = c.id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (alert_id) {
        query += ` AND n.alert_id = $${paramIndex}`;
        params.push(alert_id);
        paramIndex++;
      }

      if (status) {
        query += ` AND n.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY n.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      res.json({
        data: result.rows,
        limit,
        offset,
      });
    } catch (error) {
      logger.error('Failed to fetch notifications', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch notifications' });
    }
  }

  // Get queue statistics
  public async getQueueStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const emailStats = await notificationQueue.getEmailQueueStats();
      const smsStats = await notificationQueue.getSmsQueueStats();

      res.json({
        email: emailStats,
        sms: smsStats,
      });
    } catch (error) {
      logger.error('Failed to fetch queue stats', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch queue statistics' });
    }
  }

  // Helper methods
  private async createNotificationRecord(
    alert_id: string,
    contact_id: string,
    notification_type: 'email' | 'sms',
    template_id: string,
    recipient_email: string | null,
    recipient_phone: string | null,
    subject: string,
    body_text: string,
    body_html: string | null
  ): Promise<string> {
    const result = await db.query(
      `INSERT INTO notifications (
        alert_id, contact_id, notification_type, template_id,
        recipient_email, recipient_phone, subject, message_body, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued')
      RETURNING id`,
      [alert_id, contact_id, notification_type, template_id, recipient_email, recipient_phone, subject, body_text]
    );

    return result.rows[0].id;
  }

  private renderTemplate(template: string, variables: Partial<TemplateVariables>): string {
    let rendered = template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      rendered = rendered.replace(new RegExp(placeholder, 'g'), value || '');
    }
    return rendered;
  }

  private formatAlertType(alertType: string): string {
    const typeMap: Record<string, string> = {
      online_offline_status_ctx: 'Device Offline',
      perf_disk_usage_ctx: 'Disk Space Critical',
      perf_resource_usage_ctx: 'Resource Usage High',
      antivirus_ctx: 'Antivirus Issue',
      patch_ctx: 'Missing Patches',
      ransomware_ctx: 'Ransomware Detected',
    };
    return typeMap[alertType] || alertType;
  }

  private extractAlertDetails(alertContext: any): string {
    if (!alertContext) return 'No details available';

    // Extract key details based on alert type
    const details: string[] = [];

    if (alertContext.usagePercent) {
      details.push(`Usage: ${alertContext.usagePercent}%`);
    }
    if (alertContext.freeSpaceGB) {
      details.push(`Free Space: ${alertContext.freeSpaceGB} GB`);
    }
    if (alertContext.cpuUsagePercent) {
      details.push(`CPU: ${alertContext.cpuUsagePercent}%`);
    }
    if (alertContext.memoryUsagePercent) {
      details.push(`Memory: ${alertContext.memoryUsagePercent}%`);
    }
    if (alertContext.status) {
      details.push(`Status: ${alertContext.status}`);
    }

    return details.length > 0 ? details.join(', ') : JSON.stringify(alertContext).substring(0, 200);
  }
}

export default new NotificationsController();
