import cron from 'node-cron';
import dattoRmmService from './dattoRmmService';
import alertClassificationService from './alertClassificationService';
import db from '../config/database';
import logger from '../utils/logger';
import config from '../config';
import { DattoAlert } from '../../../shared/types';

class AlertPollingService {
  private cronJob: cron.ScheduledTask | null = null;
  private isPolling = false;
  private processedAlertUids = new Set<string>();

  public start(): void {
    const intervalMinutes = config.polling.intervalMinutes;
    // Convert minutes to cron expression
    const cronExpression = `*/${intervalMinutes} * * * *`;

    logger.info(`Starting alert polling service with interval: ${intervalMinutes} minutes`);

    this.cronJob = cron.schedule(cronExpression, async () => {
      await this.poll();
    });

    // Run initial poll immediately
    this.poll();
  }

  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Alert polling service stopped');
    }
  }

  private async poll(): Promise<void> {
    if (this.isPolling) {
      logger.warn('Polling already in progress, skipping this cycle');
      return;
    }

    this.isPolling = true;
    logger.info('Starting alert polling cycle');

    try {
      // Fetch all open alerts from Datto RMM
      const alerts = await dattoRmmService.getAccountAlerts();
      logger.info(`Fetched ${alerts.length} open alerts from Datto RMM`);

      // Process each alert
      let newCriticalAlerts = 0;
      let totalProcessed = 0;

      for (const alert of alerts) {
        try {
          const processed = await this.processAlert(alert);
          if (processed) {
            totalProcessed++;
            // Check if it's a new critical alert
            const priority = await alertClassificationService.classifyAlert(alert);
            if (alertClassificationService.isCritical(priority) && !this.processedAlertUids.has(alert.alertUid)) {
              newCriticalAlerts++;
            }
          }
        } catch (error) {
          logger.error(`Failed to process alert ${alert.alertUid}`, error);
        }
      }

      logger.info(`Polling cycle completed. Processed: ${totalProcessed}, New critical: ${newCriticalAlerts}`);

      // Clean up old processed UIDs from memory (keep last 10000)
      if (this.processedAlertUids.size > 10000) {
        const uidsArray = Array.from(this.processedAlertUids);
        this.processedAlertUids = new Set(uidsArray.slice(-5000));
      }
    } catch (error) {
      logger.error('Alert polling cycle failed', error);
    } finally {
      this.isPolling = false;
    }
  }

  private async processAlert(alert: DattoAlert): Promise<boolean> {
    try {
      // Check if alert already exists
      const existingAlert = await db.query(
        'SELECT id, status FROM alerts WHERE alert_uid = $1',
        [alert.alertUid]
      );

      if (existingAlert.rows.length > 0) {
        // Alert exists, update if needed
        await this.updateExistingAlert(alert, existingAlert.rows[0].id);
        return false; // Not a new alert
      }

      // New alert - classify and store
      const priority = await alertClassificationService.classifyAlert(alert);

      // Ensure site and device exist in database
      await this.ensureSiteExists(alert);
      await this.ensureDeviceExists(alert);

      // Get site_id and device_id
      const siteId = await this.getSiteId(alert.alertSourceInfo?.siteUid);
      const deviceId = await this.getDeviceId(alert.alertSourceInfo?.deviceUid);

      // Extract alert type
      const alertType = alert.alertContext?.['@class'] || 'unknown';

      // Insert new alert
      await db.query(
        `INSERT INTO alerts (
          alert_uid, device_id, site_id, alert_type, priority, status,
          alert_message, alert_context, alert_source_info, diagnostics,
          ticket_number, detected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        [
          alert.alertUid,
          deviceId,
          siteId,
          alertType,
          priority,
          'open',
          alert.alertMessage,
          JSON.stringify(alert.alertContext),
          JSON.stringify(alert.alertSourceInfo),
          alert.diagnostics,
          alert.ticketNumber,
        ]
      );

      logger.info(`Stored new ${priority} alert ${alert.alertUid}`);
      this.processedAlertUids.add(alert.alertUid);

      return true;
    } catch (error) {
      logger.error(`Failed to process alert ${alert.alertUid}`, error);
      return false;
    }
  }

  private async updateExistingAlert(alert: DattoAlert, alertId: string): Promise<void> {
    // Update alert context and diagnostics in case they changed
    await db.query(
      `UPDATE alerts SET
        alert_message = $1,
        alert_context = $2,
        alert_source_info = $3,
        diagnostics = $4,
        ticket_number = $5,
        updated_at = NOW()
      WHERE id = $6`,
      [
        alert.alertMessage,
        JSON.stringify(alert.alertContext),
        JSON.stringify(alert.alertSourceInfo),
        alert.diagnostics,
        alert.ticketNumber,
        alertId,
      ]
    );
  }

  private async ensureSiteExists(alert: DattoAlert): Promise<void> {
    const siteUid = alert.alertSourceInfo?.siteUid;
    const siteName = alert.alertSourceInfo?.siteName;

    if (!siteUid) return;

    const existing = await db.query('SELECT id FROM sites WHERE site_uid = $1', [siteUid]);

    if (existing.rows.length === 0) {
      await db.query(
        'INSERT INTO sites (site_uid, site_name) VALUES ($1, $2) ON CONFLICT (site_uid) DO NOTHING',
        [siteUid, siteName || 'Unknown Site']
      );
    }
  }

  private async ensureDeviceExists(alert: DattoAlert): Promise<void> {
    const deviceUid = alert.alertSourceInfo?.deviceUid;
    const deviceName = alert.alertSourceInfo?.deviceName;
    const siteUid = alert.alertSourceInfo?.siteUid;

    if (!deviceUid) return;

    const existing = await db.query('SELECT id FROM devices WHERE device_uid = $1', [deviceUid]);

    if (existing.rows.length === 0) {
      const siteId = await this.getSiteId(siteUid);
      await db.query(
        'INSERT INTO devices (device_uid, site_id, device_name) VALUES ($1, $2, $3) ON CONFLICT (device_uid) DO NOTHING',
        [deviceUid, siteId, deviceName || 'Unknown Device']
      );
    }
  }

  private async getSiteId(siteUid?: string): Promise<string | null> {
    if (!siteUid) return null;
    const result = await db.query('SELECT id FROM sites WHERE site_uid = $1', [siteUid]);
    return result.rows[0]?.id || null;
  }

  private async getDeviceId(deviceUid?: string): Promise<string | null> {
    if (!deviceUid) return null;
    const result = await db.query('SELECT id FROM devices WHERE device_uid = $1', [deviceUid]);
    return result.rows[0]?.id || null;
  }

  public async manualPoll(): Promise<void> {
    logger.info('Manual poll triggered');
    await this.poll();
  }

  public isCurrentlyPolling(): boolean {
    return this.isPolling;
  }
}

export default new AlertPollingService();
