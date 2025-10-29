import Bull, { Queue, Job } from 'bull';
import redisClient from '../config/redis';
import emailService from './emailService';
import smsService from './smsService';
import notificationRepository from '../repositories/notificationRepository';
import logger from '../config/logger';

interface NotificationJob {
  notificationId: string;
  type: 'email' | 'sms';
  to: string;
  subject?: string;
  message: string;
}

class NotificationQueueService {
  private emailQueue: Queue<NotificationJob>;
  private smsQueue: Queue<NotificationJob>;

  constructor() {
    const redisConfig = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
    };

    // Create separate queues for email and SMS
    this.emailQueue = new Bull<NotificationJob>('email-notifications', redisConfig);
    this.smsQueue = new Bull<NotificationJob>('sms-notifications', redisConfig);

    this.setupProcessors();
    this.setupEventHandlers();
  }

  /**
   * Setup queue processors
   */
  private setupProcessors() {
    // Email queue processor
    this.emailQueue.process(5, async (job: Job<NotificationJob>) => {
      return await this.processEmailNotification(job);
    });

    // SMS queue processor (limited to 10 per minute for cost control)
    this.smsQueue.process(1, async (job: Job<NotificationJob>) => {
      return await this.processSMSNotification(job);
    });
  }

  /**
   * Setup event handlers for queue monitoring
   */
  private setupEventHandlers() {
    // Email queue events
    this.emailQueue.on('completed', (job) => {
      logger.info(`Email notification job ${job.id} completed`);
    });

    this.emailQueue.on('failed', (job, err) => {
      logger.error(`Email notification job ${job?.id} failed:`, err);
    });

    this.emailQueue.on('stalled', (job) => {
      logger.warn(`Email notification job ${job.id} stalled`);
    });

    // SMS queue events
    this.smsQueue.on('completed', (job) => {
      logger.info(`SMS notification job ${job.id} completed`);
    });

    this.smsQueue.on('failed', (job, err) => {
      logger.error(`SMS notification job ${job?.id} failed:`, err);
    });

    this.smsQueue.on('stalled', (job) => {
      logger.warn(`SMS notification job ${job.id} stalled`);
    });
  }

  /**
   * Process email notification
   */
  private async processEmailNotification(job: Job<NotificationJob>): Promise<void> {
    const { notificationId, to, subject, message } = job.data;

    try {
      logger.info(`Processing email notification ${notificationId} to ${to}`);

      // Update status to sent
      await notificationRepository.updateStatus(notificationId, 'sent');

      // Send email
      const success = await emailService.sendEmail(to, subject || 'Alert Notification', message);

      if (success) {
        await notificationRepository.updateStatus(notificationId, 'delivered');
      } else {
        throw new Error('Email delivery failed');
      }
    } catch (error: any) {
      logger.error(`Error processing email notification ${notificationId}:`, error);
      await notificationRepository.updateStatus(notificationId, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Process SMS notification
   */
  private async processSMSNotification(job: Job<NotificationJob>): Promise<void> {
    const { notificationId, to, message } = job.data;

    try {
      logger.info(`Processing SMS notification ${notificationId} to ${to}`);

      // Update status to sent
      await notificationRepository.updateStatus(notificationId, 'sent');

      // Send SMS
      const success = await smsService.sendSMS(to, message);

      if (success) {
        await notificationRepository.updateStatus(notificationId, 'delivered');
      } else {
        throw new Error('SMS delivery failed');
      }

      // Rate limiting: wait 6 seconds between SMS to stay under 10/minute
      await this.sleep(6000);
    } catch (error: any) {
      logger.error(`Error processing SMS notification ${notificationId}:`, error);
      await notificationRepository.updateStatus(notificationId, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Queue email notification
   */
  async queueEmail(
    notificationId: string,
    to: string,
    subject: string,
    message: string,
    priority: number = 5
  ): Promise<void> {
    await this.emailQueue.add(
      {
        notificationId,
        type: 'email',
        to,
        subject,
        message,
      },
      {
        priority,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000, // Start with 1 minute delay
        },
        timeout: 60000, // 60 second timeout
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: false, // Keep failed jobs for debugging
      }
    );

    logger.info(`Email notification ${notificationId} queued for ${to}`);
  }

  /**
   * Queue SMS notification
   */
  async queueSMS(
    notificationId: string,
    to: string,
    message: string,
    priority: number = 5
  ): Promise<void> {
    await this.smsQueue.add(
      {
        notificationId,
        type: 'sms',
        to,
        message,
      },
      {
        priority,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000,
        },
        timeout: 30000, // 30 second timeout
        removeOnComplete: 100,
        removeOnFail: false,
      }
    );

    logger.info(`SMS notification ${notificationId} queued for ${to}`);
  }

  /**
   * Get queue statistics
   */
  async getEmailQueueStats() {
    return {
      waiting: await this.emailQueue.getWaitingCount(),
      active: await this.emailQueue.getActiveCount(),
      completed: await this.emailQueue.getCompletedCount(),
      failed: await this.emailQueue.getFailedCount(),
      delayed: await this.emailQueue.getDelayedCount(),
    };
  }

  async getSMSQueueStats() {
    return {
      waiting: await this.smsQueue.getWaitingCount(),
      active: await this.smsQueue.getActiveCount(),
      completed: await this.smsQueue.getCompletedCount(),
      failed: await this.smsQueue.getFailedCount(),
      delayed: await this.smsQueue.getDelayedCount(),
    };
  }

  /**
   * Retry failed job
   */
  async retryFailedJob(jobId: string, queueType: 'email' | 'sms'): Promise<boolean> {
    try {
      const queue = queueType === 'email' ? this.emailQueue : this.smsQueue;
      const job = await queue.getJob(jobId);

      if (job) {
        await job.retry();
        logger.info(`Retrying ${queueType} job ${jobId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error retrying job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Clear completed jobs
   */
  async clearCompleted(): Promise<void> {
    await this.emailQueue.clean(1000, 'completed');
    await this.smsQueue.clean(1000, 'completed');
    logger.info('Cleared completed jobs from queues');
  }

  /**
   * Pause queues
   */
  async pause(): Promise<void> {
    await this.emailQueue.pause();
    await this.smsQueue.pause();
    logger.info('Notification queues paused');
  }

  /**
   * Resume queues
   */
  async resume(): Promise<void> {
    await this.emailQueue.resume();
    await this.smsQueue.resume();
    logger.info('Notification queues resumed');
  }

  /**
   * Close queues gracefully
   */
  async close(): Promise<void> {
    await this.emailQueue.close();
    await this.smsQueue.close();
    logger.info('Notification queues closed');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default new NotificationQueueService();
