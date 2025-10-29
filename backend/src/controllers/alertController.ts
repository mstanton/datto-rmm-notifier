import { Request, Response } from 'express';
import alertRepository from '../repositories/alertRepository';
import dattoAPI from '../services/dattoAPI';
import alertPoller from '../services/alertPoller';
import logger from '../config/logger';

class AlertController {
  /**
   * Get all alerts with filtering
   */
  async getAlerts(req: Request, res: Response) {
    try {
      const {
        status,
        priority,
        siteUid,
        deviceUid,
        alertType,
        startDate,
        endDate,
        search,
        page = '1',
        limit = '50',
      } = req.query;

      const filters: any = {};

      if (status) {
        filters.status = Array.isArray(status) ? status : [status];
      }

      if (priority) {
        filters.priority = Array.isArray(priority) ? priority : [priority];
      }

      if (siteUid) filters.siteUid = siteUid as string;
      if (deviceUid) filters.deviceUid = deviceUid as string;
      if (alertType) filters.alertType = alertType as string;
      if (search) filters.search = search as string;

      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);

      filters.limit = limitNum;
      filters.offset = (pageNum - 1) * limitNum;

      const result = await alertRepository.findAll(filters);

      res.json({
        success: true,
        data: result.alerts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: result.total,
          pages: Math.ceil(result.total / limitNum),
        },
      });
    } catch (error) {
      logger.error('Error getting alerts:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve alerts' });
    }
  }

  /**
   * Get single alert by ID
   */
  async getAlert(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const alert = await alertRepository.findById(id);

      if (!alert) {
        return res.status(404).json({ success: false, error: 'Alert not found' });
      }

      res.json({ success: true, data: alert });
    } catch (error) {
      logger.error('Error getting alert:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve alert' });
    }
  }

  /**
   * Get critical alerts
   */
  async getCriticalAlerts(req: Request, res: Response) {
    try {
      const alerts = await alertRepository.findCriticalAlerts();

      res.json({ success: true, data: alerts });
    } catch (error) {
      logger.error('Error getting critical alerts:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve critical alerts' });
    }
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { resolutionNotes } = req.body;

      const alert = await alertRepository.findById(id);

      if (!alert) {
        return res.status(404).json({ success: false, error: 'Alert not found' });
      }

      // Resolve in Datto RMM
      const resolved = await dattoAPI.resolveAlert(alert.alert_uid);

      if (!resolved) {
        return res.status(500).json({
          success: false,
          error: 'Failed to resolve alert in Datto RMM',
        });
      }

      // Update in database
      const updatedAlert = await alertRepository.updateStatus(
        alert.alert_uid,
        'resolved',
        resolutionNotes
      );

      logger.info(`Alert ${alert.alert_uid} resolved by user`);

      res.json({ success: true, data: updatedAlert });
    } catch (error) {
      logger.error('Error resolving alert:', error);
      res.status(500).json({ success: false, error: 'Failed to resolve alert' });
    }
  }

  /**
   * Get alert statistics
   */
  async getStatistics(req: Request, res: Response) {
    try {
      const { siteUid } = req.query;

      const stats = await alertRepository.getStatistics(siteUid as string | undefined);

      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Error getting statistics:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve statistics' });
    }
  }

  /**
   * Trigger manual poll
   */
  async manualPoll(req: Request, res: Response) {
    try {
      const result = await alertPoller.manualPoll();

      res.json({
        success: result.success,
        data: {
          newAlerts: result.newAlerts,
          criticalAlerts: result.criticalAlerts,
        },
      });
    } catch (error) {
      logger.error('Error during manual poll:', error);
      res.status(500).json({ success: false, error: 'Manual poll failed' });
    }
  }
}

export default new AlertController();
