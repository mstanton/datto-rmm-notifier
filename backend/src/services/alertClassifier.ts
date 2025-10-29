import logger from '../config/logger';
import {
  AlertContext,
  OnlineOfflineStatusContext,
  PerfDiskUsageContext,
  PerfResourceUsageContext,
  AntivirusContext,
  PatchContext,
  RansomwareContext,
} from '../types/datto';
import { AlertRule } from '../types/models';
import db from '../config/database';

class AlertClassifierService {
  /**
   * Classify an alert's priority based on alert context and rules
   */
  async classifyAlert(alertContext: string): Promise<'critical' | 'high' | 'medium' | 'low'> {
    try {
      const context: AlertContext = JSON.parse(alertContext);
      const alertType = context['@class'];

      // Check custom rules first
      const customPriority = await this.checkCustomRules(alertType, context);
      if (customPriority) {
        return customPriority;
      }

      // Apply default classification rules
      return this.applyDefaultRules(alertType, context);
    } catch (error) {
      logger.error('Error classifying alert:', error);
      return 'medium'; // Default to medium if classification fails
    }
  }

  /**
   * Check if alert matches any custom rules
   */
  private async checkCustomRules(
    alertType: string,
    context: AlertContext
  ): Promise<'critical' | 'high' | 'medium' | 'low' | null> {
    try {
      const result = await db.query<AlertRule>(
        `SELECT * FROM alert_rules
         WHERE alert_type = $1 AND active = true
         ORDER BY priority DESC`,
        [alertType]
      );

      for (const rule of result.rows) {
        if (this.matchesConditions(context, rule.conditions)) {
          logger.info(`Alert matched custom rule: ${rule.name}`);
          return rule.priority;
        }
      }

      return null;
    } catch (error) {
      logger.error('Error checking custom rules:', error);
      return null;
    }
  }

  /**
   * Apply default classification rules
   */
  private applyDefaultRules(
    alertType: string,
    context: AlertContext
  ): 'critical' | 'high' | 'medium' | 'low' {
    switch (alertType) {
      case 'online_offline_status_ctx':
        return this.classifyOnlineOfflineAlert(context as OnlineOfflineStatusContext);

      case 'perf_disk_usage_ctx':
        return this.classifyDiskUsageAlert(context as PerfDiskUsageContext);

      case 'perf_resource_usage_ctx':
        return this.classifyResourceUsageAlert(context as PerfResourceUsageContext);

      case 'antivirus_ctx':
        return this.classifyAntivirusAlert(context as AntivirusContext);

      case 'patch_ctx':
        return this.classifyPatchAlert(context as PatchContext);

      case 'ransomware_ctx':
        return this.classifyRansomwareAlert(context as RansomwareContext);

      default:
        logger.warn(`Unknown alert type: ${alertType}`);
        return 'medium';
    }
  }

  /**
   * Classify online/offline status alerts
   */
  private classifyOnlineOfflineAlert(context: OnlineOfflineStatusContext): 'critical' | 'high' | 'medium' | 'low' {
    if (context.status === 'offline') {
      // Critical if offline for more than 5 minutes
      const durationMinutes = context.duration / 60;
      if (durationMinutes >= 5) {
        return 'critical';
      } else if (durationMinutes >= 2) {
        return 'high';
      }
      return 'medium';
    }
    return 'low';
  }

  /**
   * Classify disk usage alerts
   */
  private classifyDiskUsageAlert(context: PerfDiskUsageContext): 'critical' | 'high' | 'medium' | 'low' {
    // Critical if usage > 90% OR free space < 5GB
    if (context.usagePercent >= 90 || context.freeSpace < 5) {
      return 'critical';
    } else if (context.usagePercent >= 80 || context.freeSpace < 10) {
      return 'high';
    } else if (context.usagePercent >= 70) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Classify resource usage alerts (CPU, Memory, Network)
   */
  private classifyResourceUsageAlert(context: PerfResourceUsageContext): 'critical' | 'high' | 'medium' | 'low' {
    const durationMinutes = context.duration / 60;

    if (context.resourceType === 'cpu') {
      // Critical if CPU > 95% for 10+ minutes
      if (context.usagePercent >= 95 && durationMinutes >= 10) {
        return 'critical';
      } else if (context.usagePercent >= 90 && durationMinutes >= 5) {
        return 'high';
      } else if (context.usagePercent >= 80) {
        return 'medium';
      }
    } else if (context.resourceType === 'memory') {
      // Critical if Memory > 90%
      if (context.usagePercent >= 90) {
        return 'critical';
      } else if (context.usagePercent >= 80) {
        return 'high';
      } else if (context.usagePercent >= 70) {
        return 'medium';
      }
    } else if (context.resourceType === 'network') {
      if (context.usagePercent >= 90) {
        return 'high';
      } else if (context.usagePercent >= 80) {
        return 'medium';
      }
    }

    return 'low';
  }

  /**
   * Classify antivirus alerts
   */
  private classifyAntivirusAlert(context: AntivirusContext): 'critical' | 'high' | 'medium' | 'low' {
    if (context.status === 'disabled') {
      return 'critical';
    } else if (context.status === 'threat_detected') {
      return 'critical';
    } else if (context.status === 'outdated') {
      // Check how old the definitions are
      const lastUpdate = new Date(context.lastUpdate);
      const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceUpdate >= 7) {
        return 'critical';
      } else if (daysSinceUpdate >= 3) {
        return 'high';
      }
      return 'medium';
    }

    return 'low';
  }

  /**
   * Classify patch alerts
   */
  private classifyPatchAlert(context: PatchContext): 'critical' | 'high' | 'medium' | 'low' {
    // Critical if patches have CVSS score > 7.0
    if (context.cvssScore && context.cvssScore >= 7.0) {
      return 'critical';
    } else if (context.criticalPatches > 0) {
      return 'high';
    } else if (context.missingPatches >= 10) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Classify ransomware alerts (always critical)
   */
  private classifyRansomwareAlert(_context: RansomwareContext): 'critical' {
    return 'critical';
  }

  /**
   * Check if alert context matches rule conditions
   */
  private matchesConditions(context: AlertContext, conditions: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(conditions)) {
      const contextValue = (context as any)[key];

      if (contextValue === undefined) {
        return false;
      }

      // Handle different condition types
      if (key.startsWith('min_')) {
        const actualKey = key.replace('min_', '');
        const actualValue = (context as any)[actualKey];
        if (actualValue < value) {
          return false;
        }
      } else if (key.startsWith('max_')) {
        const actualKey = key.replace('max_', '');
        const actualValue = (context as any)[actualKey];
        if (actualValue > value) {
          return false;
        }
      } else {
        // Exact match
        if (contextValue !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Determine if an alert should trigger automatic notification
   */
  async shouldAutoNotify(alertType: string, context: AlertContext): Promise<boolean> {
    try {
      const result = await db.query<AlertRule>(
        `SELECT auto_notify FROM alert_rules
         WHERE alert_type = $1 AND active = true`,
        [alertType]
      );

      for (const rule of result.rows) {
        if (this.matchesConditions(context, rule.conditions) && rule.auto_notify) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Error checking auto-notify rules:', error);
      return false;
    }
  }

  /**
   * Extract human-readable alert details from context
   */
  extractAlertDetails(alertContext: string): string {
    try {
      const context: AlertContext = JSON.parse(alertContext);
      const alertType = context['@class'];

      switch (alertType) {
        case 'online_offline_status_ctx': {
          const ctx = context as OnlineOfflineStatusContext;
          const minutes = Math.floor(ctx.duration / 60);
          return `Device ${ctx.status} for ${minutes} minutes`;
        }

        case 'perf_disk_usage_ctx': {
          const ctx = context as PerfDiskUsageContext;
          return `Drive ${ctx.drive}: ${ctx.usagePercent}% full (${ctx.freeSpace}GB free of ${ctx.totalSpace}GB)`;
        }

        case 'perf_resource_usage_ctx': {
          const ctx = context as PerfResourceUsageContext;
          const minutes = Math.floor(ctx.duration / 60);
          return `${ctx.resourceType.toUpperCase()} usage at ${ctx.usagePercent}% for ${minutes} minutes`;
        }

        case 'antivirus_ctx': {
          const ctx = context as AntivirusContext;
          if (ctx.status === 'threat_detected') {
            return `Threat detected: ${ctx.threatName || 'Unknown'}`;
          }
          return `Antivirus ${ctx.status}. Last update: ${ctx.lastUpdate}`;
        }

        case 'patch_ctx': {
          const ctx = context as PatchContext;
          return `${ctx.missingPatches} patches missing (${ctx.criticalPatches} critical). Oldest: ${ctx.oldestPatchDate}`;
        }

        case 'ransomware_ctx': {
          const ctx = context as RansomwareContext;
          return `Ransomware detected! Threat level: ${ctx.threatLevel}. Affected files: ${ctx.detectedFiles}`;
        }

        default:
          return JSON.stringify(context);
      }
    } catch (error) {
      logger.error('Error extracting alert details:', error);
      return alertContext;
    }
  }
}

export default new AlertClassifierService();
