import { DattoAlert } from '../../../shared/types';
import { AlertPriority } from '../../../shared/types';
import logger from '../utils/logger';
import db from '../config/database';

interface ClassificationRule {
  id: string;
  rule_name: string;
  alert_type_pattern: string;
  priority: AlertPriority;
  conditions: Record<string, any>;
  is_active: boolean;
  order_index: number;
}

class AlertClassificationService {
  private rules: ClassificationRule[] = [];
  private lastRuleUpdate: Date | null = null;
  private readonly RULE_CACHE_TTL_MS = 300000; // 5 minutes

  constructor() {
    this.loadRules();
  }

  private async loadRules(): Promise<void> {
    try {
      const result = await db.query<ClassificationRule>(
        'SELECT * FROM alert_classification_rules WHERE is_active = true ORDER BY order_index ASC'
      );
      this.rules = result.rows;
      this.lastRuleUpdate = new Date();
      logger.info(`Loaded ${this.rules.length} alert classification rules`);
    } catch (error) {
      logger.error('Failed to load alert classification rules', error);
    }
  }

  private async ensureRulesLoaded(): Promise<void> {
    if (!this.lastRuleUpdate || Date.now() - this.lastRuleUpdate.getTime() > this.RULE_CACHE_TTL_MS) {
      await this.loadRules();
    }
  }

  public async classifyAlert(alert: DattoAlert): Promise<AlertPriority> {
    await this.ensureRulesLoaded();

    // Extract alert type from alertContext @class property
    const alertType = this.extractAlertType(alert);

    logger.debug(`Classifying alert ${alert.alertUid} of type ${alertType}`);

    // Apply rules in order
    for (const rule of this.rules) {
      if (this.matchesPattern(alertType, rule.alert_type_pattern)) {
        if (this.evaluateConditions(alert, rule.conditions)) {
          logger.debug(`Alert ${alert.alertUid} matched rule ${rule.rule_name}, priority: ${rule.priority}`);
          return rule.priority;
        }
      }
    }

    // Default priority if no rules match
    logger.debug(`Alert ${alert.alertUid} did not match any rules, using default priority: medium`);
    return 'medium';
  }

  private extractAlertType(alert: DattoAlert): string {
    if (alert.alertContext && alert.alertContext['@class']) {
      return alert.alertContext['@class'];
    }
    // Fallback: try to infer from alert message
    const message = alert.alertMessage?.toLowerCase() || '';
    if (message.includes('offline') || message.includes('online')) {
      return 'online_offline_status_ctx';
    }
    if (message.includes('disk')) {
      return 'perf_disk_usage_ctx';
    }
    if (message.includes('cpu') || message.includes('memory')) {
      return 'perf_resource_usage_ctx';
    }
    if (message.includes('antivirus')) {
      return 'antivirus_ctx';
    }
    if (message.includes('patch')) {
      return 'patch_ctx';
    }
    if (message.includes('ransomware')) {
      return 'ransomware_ctx';
    }
    return 'unknown';
  }

  private matchesPattern(alertType: string, pattern: string): boolean {
    // Simple pattern matching - can be enhanced with regex
    return alertType === pattern || pattern === '*';
  }

  private evaluateConditions(alert: DattoAlert, conditions: Record<string, any>): boolean {
    const context = alert.alertContext || {};

    // Evaluate each condition
    for (const [key, value] of Object.entries(conditions)) {
      if (!this.evaluateCondition(context, key, value)) {
        return false;
      }
    }

    return true;
  }

  private evaluateCondition(context: Record<string, any>, key: string, expectedValue: any): boolean {
    switch (key) {
      case 'offline_duration_minutes':
        return this.checkOfflineDuration(context, expectedValue);
      case 'usage_percent_threshold':
        return this.checkUsagePercent(context, expectedValue);
      case 'free_gb_threshold':
        return this.checkFreeSpace(context, expectedValue);
      case 'cpu_percent_threshold':
        return this.checkCpuUsage(context, expectedValue);
      case 'memory_percent_threshold':
        return this.checkMemoryUsage(context, expectedValue);
      case 'duration_minutes':
        return this.checkDuration(context, expectedValue);
      case 'status':
        return context.status === expectedValue || context.antivirusStatus === expectedValue;
      case 'cvss_score_threshold':
        return this.checkCvssScore(context, expectedValue);
      default:
        // Generic equality check
        return context[key] === expectedValue;
    }
  }

  private checkOfflineDuration(context: Record<string, any>, minMinutes: number): boolean {
    // Check if device has been offline for at least minMinutes
    if (context.status === 'offline' && context.lastSeenDate) {
      const lastSeen = new Date(context.lastSeenDate);
      const minutesOffline = (Date.now() - lastSeen.getTime()) / 60000;
      return minutesOffline >= minMinutes;
    }
    return context.status === 'offline'; // If no lastSeenDate, assume critical if offline
  }

  private checkUsagePercent(context: Record<string, any>, threshold: number): boolean {
    const usage = context.usagePercent || context.diskUsagePercent || 0;
    return usage >= threshold;
  }

  private checkFreeSpace(context: Record<string, any>, thresholdGb: number): boolean {
    const freeGb = context.freeSpaceGB || context.availableSpaceGB || Infinity;
    return freeGb <= thresholdGb;
  }

  private checkCpuUsage(context: Record<string, any>, threshold: number): boolean {
    const cpuUsage = context.cpuUsagePercent || context.cpuPercent || 0;
    return cpuUsage >= threshold;
  }

  private checkMemoryUsage(context: Record<string, any>, threshold: number): boolean {
    const memUsage = context.memoryUsagePercent || context.memoryPercent || 0;
    return memUsage >= threshold;
  }

  private checkDuration(context: Record<string, any>, minMinutes: number): boolean {
    if (context.startTime) {
      const start = new Date(context.startTime);
      const durationMinutes = (Date.now() - start.getTime()) / 60000;
      return durationMinutes >= minMinutes;
    }
    return true; // If no duration info, assume condition is met
  }

  private checkCvssScore(context: Record<string, any>, threshold: number): boolean {
    const patches = context.patches || [];
    return patches.some((patch: any) => (patch.cvssScore || 0) >= threshold);
  }

  public isCritical(priority: AlertPriority): boolean {
    return priority === 'critical';
  }

  public async reloadRules(): Promise<void> {
    await this.loadRules();
  }
}

export default new AlertClassificationService();
