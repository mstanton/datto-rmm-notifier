import { Request, Response } from 'express';
import notificationRepository from '../repositories/notificationRepository';
import contactRepository from '../repositories/contactRepository';
import alertRepository from '../repositories/alertRepository';
import notificationQueue from '../services/notificationQueue';
import alertClassifier from '../services/alertClassifier';
import db from '../config/database';
import logger from '../config/logger';

class NotificationController {
  /**
   * Send notification for an alert
   */
  async sendNotification(req: Request, res: Response) {
    try {
      const { alertId } = req.params;
      const {
        contactIds,
        type, // 'email', 'sms', or 'both'
        templateName,
        customMessage,
      } = req.body;

      // Validation
      if (!contactIds || contactIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one contact must be specified',
        });
      }

      // Get alert
      const alert = await alertRepository.findById(alertId);
      if (!alert) {
        return res.status(404).json({ success: false, error: 'Alert not found' });
      }

      // Prepare template variables
      const alertDetails = alertClassifier.extractAlertDetails(
        JSON.stringify(alert.alert_context)
      );

      const variables = {
        device_name: alert.device_name,
        site_name: alert.site_name,
        alert_type: alert.alert_type,
        alert_time: alert.alert_date.toLocaleString(),
        alert_details: alertDetails,
        admin_message: customMessage || '',
        support_phone: process.env.SUPPORT_PHONE || '555-0100',
        support_email: process.env.SUPPORT_EMAIL || 'support@example.com',
      };

      const notifications: any[] = [];

      // Send to each contact
      for (const contactId of contactIds) {
        const contact = await contactRepository.findById(contactId);
        if (!contact) {
          logger.warn(`Contact ${contactId} not found, skipping`);
          continue;
        }

        // Send email if requested
        if ((type === 'email' || type === 'both') && contact.notification_preferences.email) {
          const notification = await this.sendEmailNotification(
            alert,
            contact,
            templateName || 'critical_alert_email',
            variables
          );
          if (notification) notifications.push(notification);
        }

        // Send SMS if requested
        if ((type === 'sms' || type === 'both') && contact.notification_preferences.sms && contact.phone) {
          const notification = await this.sendSMSNotification(
            alert,
            contact,
            templateName || 'critical_alert_sms',
            variables
          );
          if (notification) notifications.push(notification);
        }
      }

      // Update alert status to notified
      await alertRepository.updateStatus(alert.alert_uid, 'notified');

      res.json({
        success: true,
        message: `${notifications.length} notification(s) queued`,
        data: notifications,
      });
    } catch (error) {
      logger.error('Error sending notification:', error);
      res.status(500).json({ success: false, error: 'Failed to send notification' });
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(alert: any, contact: any, templateName: string, variables: any) {
    try {
      // Get template
      const template = await this.getTemplate(templateName, 'email');
      if (!template) {
        logger.error(`Email template ${templateName} not found`);
        return null;
      }

      // Create notification record
      const notification = await notificationRepository.create({
        alert_id: alert.id,
        contact_id: contact.id,
        type: 'email',
        template_name: templateName,
        subject: template.subject || 'Alert Notification',
        message: template.body,
        status: 'queued',
        delivery_attempts: 0,
      } as any);

      // Queue for delivery
      await notificationQueue.queueEmail(
        notification.id,
        contact.email,
        template.subject || 'Alert Notification',
        template.body,
        5 // priority
      );

      logger.info(`Email notification queued for ${contact.email}`);

      return notification;
    } catch (error) {
      logger.error('Error sending email notification:', error);
      return null;
    }
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(alert: any, contact: any, templateName: string, variables: any) {
    try {
      // Get template
      const template = await this.getTemplate(templateName, 'sms');
      if (!template) {
        logger.error(`SMS template ${templateName} not found`);
        return null;
      }

      // Create notification record
      const notification = await notificationRepository.create({
        alert_id: alert.id,
        contact_id: contact.id,
        type: 'sms',
        template_name: templateName,
        message: template.body,
        status: 'queued',
        delivery_attempts: 0,
      } as any);

      // Queue for delivery
      await notificationQueue.queueSMS(
        notification.id,
        contact.phone,
        template.body,
        5
      );

      logger.info(`SMS notification queued for ${contact.phone}`);

      return notification;
    } catch (error) {
      logger.error('Error sending SMS notification:', error);
      return null;
    }
  }

  /**
   * Get notification template
   */
  private async getTemplate(name: string, type: string) {
    const result = await db.query(
      `SELECT * FROM notification_templates
       WHERE name = $1 AND type = $2 AND active = true`,
      [name, type]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all notifications with filtering
   */
  async getNotifications(req: Request, res: Response) {
    try {
      const {
        alertId,
        contactId,
        type,
        status,
        startDate,
        endDate,
        page = '1',
        limit = '50',
      } = req.query;

      const filters: any = {};

      if (alertId) filters.alertId = alertId as string;
      if (contactId) filters.contactId = contactId as string;
      if (type) filters.type = type as string;
      if (status) {
        filters.status = Array.isArray(status) ? status : [status];
      }

      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);

      filters.limit = limitNum;
      filters.offset = (pageNum - 1) * limitNum;

      const result = await notificationRepository.findAll(filters);

      res.json({
        success: true,
        data: result.notifications,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: result.total,
          pages: Math.ceil(result.total / limitNum),
        },
      });
    } catch (error) {
      logger.error('Error getting notifications:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve notifications' });
    }
  }

  /**
   * Get notification statistics
   */
  async getStatistics(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      const stats = await notificationRepository.getStatistics(
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Error getting notification statistics:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve statistics' });
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(req: Request, res: Response) {
    try {
      const emailStats = await notificationQueue.getEmailQueueStats();
      const smsStats = await notificationQueue.getSMSQueueStats();

      res.json({
        success: true,
        data: {
          email: emailStats,
          sms: smsStats,
        },
      });
    } catch (error) {
      logger.error('Error getting queue stats:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve queue statistics' });
    }
  }
}

export default new NotificationController();
