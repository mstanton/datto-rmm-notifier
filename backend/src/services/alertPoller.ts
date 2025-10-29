import cron from 'node-cron';
import dattoAPI from './dattoAPI';
import alertRepository from '../repositories/alertRepository';
import alertClassifier from './alertClassifier';
import logger from '../config/logger';
import { DattoAlert } from '../types/datto';

class AlertPollerService {
  private cronJob: cron.ScheduledTask | null = null;
  private isPolling: boolean = false;

  /**
   * Start the alert polling service
   */
  start() {
    // Run every 5 minutes
    this.cronJob = cron.schedule('*/5 * * * *', async () => {
      await this.pollAlerts();
    });

    logger.info('Alert polling service started (runs every 5 minutes)');

    // Run immediately on startup
    setTimeout(() => this.pollAlerts(), 5000);
  }

  /**
   * Stop the alert polling service
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Alert polling service stopped');
    }
  }

  /**
   * Poll Datto RMM API for new alerts
   */
  async pollAlerts(): Promise<void> {
    if (this.isPolling) {
      logger.warn('Alert polling already in progress, skipping...');
      return;
    }

    this.isPolling = true;
    const startTime = Date.now();

    try {
      logger.info('Starting alert polling...');

      // Get all open alerts from Datto RMM
      const dattoAlerts = await dattoAPI.getAccountAlerts();

      logger.info(`Retrieved ${dattoAlerts.length} open alerts from Datto RMM`);

      // Process each alert
      let newAlertsCount = 0;
      let criticalAlertsCount = 0;

      for (const dattoAlert of dattoAlerts) {
        const processed = await this.processAlert(dattoAlert);

        if (processed) {
          newAlertsCount++;

          // Check if it's critical
          const priority = await alertClassifier.classifyAlert(dattoAlert.alertContext);
          if (priority === 'critical') {
            criticalAlertsCount++;
          }
        }
      }

      const duration = Date.now() - startTime;

      logger.info(
        `Alert polling completed in ${duration}ms. ` +
        `New alerts: ${newAlertsCount}, Critical: ${criticalAlertsCount}`
      );
    } catch (error) {
      logger.error('Error during alert polling:', error);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Process a single alert
   */
  private async processAlert(dattoAlert: DattoAlert): Promise<boolean> {
    try {
      // Check if alert already exists
      const existing = await alertRepository.findByAlertUid(dattoAlert.alertUid);

      if (existing) {
        // Alert already in database, skip
        return false;
      }

      // Parse alert context to determine alert type
      let alertContext;
      try {
        alertContext = JSON.parse(dattoAlert.alertContext);
      } catch (error) {
        logger.error(`Failed to parse alertContext for ${dattoAlert.alertUid}:`, error);
        alertContext = { '@class': 'unknown', raw: dattoAlert.alertContext };
      }

      const alertType = alertContext['@class'] || 'unknown';

      // Classify the alert priority
      const priority = await alertClassifier.classifyAlert(dattoAlert.alertContext);

      // Only store critical alerts (as per specification)
      if (priority !== 'critical') {
        logger.debug(`Skipping non-critical alert ${dattoAlert.alertUid} (${priority})`);
        return false;
      }

      // Create alert in database
      const alert = await alertRepository.create({
        alert_uid: dattoAlert.alertUid,
        device_uid: dattoAlert.deviceUid,
        device_name: dattoAlert.deviceName,
        site_uid: dattoAlert.siteUid,
        site_name: dattoAlert.siteName,
        alert_type: alertType,
        alert_message: dattoAlert.alertMessage,
        alert_context: alertContext,
        alert_date: new Date(dattoAlert.alertDate),
        priority,
        status: 'open',
        detected_at: new Date(),
      });

      if (alert) {
        logger.info(
          `New critical alert detected: ${alert.device_name} - ${alert.alert_type} ` +
          `(${alert.site_name})`
        );

        // Check if this alert should trigger auto-notification
        const shouldAutoNotify = await alertClassifier.shouldAutoNotify(alertType, alertContext);

        if (shouldAutoNotify) {
          logger.info(`Alert ${alert.alert_uid} flagged for auto-notification`);
          // Note: Auto-notification logic would be implemented here
          // For now, we just flag it and let admins manually send notifications
        }

        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error processing alert ${dattoAlert.alertUid}:`, error);
      return false;
    }
  }

  /**
   * Manual poll trigger (for testing or manual refresh)
   */
  async manualPoll(): Promise<{ success: boolean; newAlerts: number; criticalAlerts: number }> {
    const startTime = Date.now();
    let newAlertsCount = 0;
    let criticalAlertsCount = 0;

    try {
      const dattoAlerts = await dattoAPI.getAccountAlerts();

      for (const dattoAlert of dattoAlerts) {
        const processed = await this.processAlert(dattoAlert);

        if (processed) {
          newAlertsCount++;

          const priority = await alertClassifier.classifyAlert(dattoAlert.alertContext);
          if (priority === 'critical') {
            criticalAlertsCount++;
          }
        }
      }

      const duration = Date.now() - startTime;

      logger.info(
        `Manual poll completed in ${duration}ms. ` +
        `New alerts: ${newAlertsCount}, Critical: ${criticalAlertsCount}`
      );

      return {
        success: true,
        newAlerts: newAlertsCount,
        criticalAlerts: criticalAlertsCount,
      };
    } catch (error) {
      logger.error('Error during manual poll:', error);
      return {
        success: false,
        newAlerts: 0,
        criticalAlerts: 0,
      };
    }
  }

  /**
   * Get polling status
   */
  getStatus(): { running: boolean; polling: boolean } {
    return {
      running: this.cronJob !== null,
      polling: this.isPolling,
    };
  }
}

export default new AlertPollerService();
