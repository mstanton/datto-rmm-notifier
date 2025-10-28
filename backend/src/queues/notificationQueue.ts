import Bull, { Queue, Job } from 'bull';
import config from '../config';
import logger from '../utils/logger';
import emailService from '../services/emailService';
import smsService from '../services/smsService';
import db from '../config/database';
import { NotificationJobData } from '../../../shared/types';

class NotificationQueue {
  private emailQueue: Queue<NotificationJobData>;
  private smsQueue: Queue<NotificationJobData>;

  constructor() {
    // Initialize Redis connection options
    const redisOptions = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
    };

    // Create email queue
    this.emailQueue = new Bull<NotificationJobData>('email-notifications', {
      redis: redisOptions,
      defaultJobOptions: {
        attempts: config.notifications.retryAttempts,
        backoff: {
          type: 'exponential',
          delay: config.notifications.retryDelayMs,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 500, // Keep last 500 failed jobs
      },
    });

    // Create SMS queue
    this.smsQueue = new Bull<NotificationJobData>('sms-notifications', {
      redis: redisOptions,
      defaultJobOptions: {
        attempts: config.notifications.retryAttempts,
        backoff: {
          type: 'exponential',
          delay: config.notifications.retryDelayMs,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });

    // Set up queue processors
    this.setupProcessors();
    this.setupEventListeners();

    logger.info('Notification queues initialized');
  }

  private setupProcessors(): void {
    // Email processor
    this.emailQueue.process(async (job: Job<NotificationJobData>) => {
      const { notification_id, recipient, subject, message_body } = job.data;

      logger.info(`Processing email notification ${notification_id}`);

      try {
        // Update status to 'sent'
        await db.query(
          'UPDATE notifications SET status = $1, updated_at = NOW() WHERE id = $2',
          ['sent', notification_id]
        );

        // Send email
        const result = await emailService.sendEmail(recipient, subject || 'Alert Notification', message_body);

        // Update notification record
        await db.query(
          `UPDATE notifications SET
            status = $1,
            external_message_id = $2,
            sent_at = NOW(),
            delivered_at = NOW(),
            updated_at = NOW()
          WHERE id = $3`,
          ['delivered', result.messageId, notification_id]
        );

        logger.info(`Email notification ${notification_id} delivered successfully`);
        return { success: true, messageId: result.messageId };
      } catch (error: any) {
        logger.error(`Failed to send email notification ${notification_id}`, error);

        // Update notification with error
        await db.query(
          `UPDATE notifications SET
            status = $1,
            error_message = $2,
            failed_at = NOW(),
            retry_count = retry_count + 1,
            updated_at = NOW()
          WHERE id = $3`,
          ['failed', error.message, notification_id]
        );

        throw error;
      }
    });

    // SMS processor
    this.smsQueue.process(async (job: Job<NotificationJobData>) => {
      const { notification_id, recipient, message_body } = job.data;

      logger.info(`Processing SMS notification ${notification_id}`);

      try {
        // Update status to 'sent'
        await db.query(
          'UPDATE notifications SET status = $1, updated_at = NOW() WHERE id = $2',
          ['sent', notification_id]
        );

        // Send SMS
        const result = await smsService.sendSms(recipient, message_body);

        // Update notification record
        await db.query(
          `UPDATE notifications SET
            status = $1,
            external_message_id = $2,
            sent_at = NOW(),
            delivered_at = NOW(),
            updated_at = NOW()
          WHERE id = $3`,
          ['delivered', result.messageSid, notification_id]
        );

        logger.info(`SMS notification ${notification_id} delivered successfully`);
        return { success: true, messageSid: result.messageSid };
      } catch (error: any) {
        logger.error(`Failed to send SMS notification ${notification_id}`, error);

        // Update notification with error
        await db.query(
          `UPDATE notifications SET
            status = $1,
            error_message = $2,
            failed_at = NOW(),
            retry_count = retry_count + 1,
            updated_at = NOW()
          WHERE id = $3`,
          ['failed', error.message, notification_id]
        );

        throw error;
      }
    });
  }

  private setupEventListeners(): void {
    // Email queue events
    this.emailQueue.on('completed', (job, result) => {
      logger.debug(`Email job ${job.id} completed`, result);
    });

    this.emailQueue.on('failed', (job, err) => {
      logger.error(`Email job ${job?.id} failed`, err);
    });

    this.emailQueue.on('stalled', (job) => {
      logger.warn(`Email job ${job.id} stalled`);
    });

    // SMS queue events
    this.smsQueue.on('completed', (job, result) => {
      logger.debug(`SMS job ${job.id} completed`, result);
    });

    this.smsQueue.on('failed', (job, err) => {
      logger.error(`SMS job ${job?.id} failed`, err);
    });

    this.smsQueue.on('stalled', (job) => {
      logger.warn(`SMS job ${job.id} stalled`);
    });
  }

  public async addEmailNotification(jobData: NotificationJobData): Promise<Job<NotificationJobData>> {
    return await this.emailQueue.add(jobData);
  }

  public async addSmsNotification(jobData: NotificationJobData): Promise<Job<NotificationJobData>> {
    return await this.smsQueue.add(jobData);
  }

  public async getEmailQueueStats(): Promise<any> {
    return {
      waiting: await this.emailQueue.getWaitingCount(),
      active: await this.emailQueue.getActiveCount(),
      completed: await this.emailQueue.getCompletedCount(),
      failed: await this.emailQueue.getFailedCount(),
      delayed: await this.emailQueue.getDelayedCount(),
    };
  }

  public async getSmsQueueStats(): Promise<any> {
    return {
      waiting: await this.smsQueue.getWaitingCount(),
      active: await this.smsQueue.getActiveCount(),
      completed: await this.smsQueue.getCompletedCount(),
      failed: await this.smsQueue.getFailedCount(),
      delayed: await this.smsQueue.getDelayedCount(),
    };
  }

  public async retryFailedJobs(queueType: 'email' | 'sms'): Promise<number> {
    const queue = queueType === 'email' ? this.emailQueue : this.smsQueue;
    const failed = await queue.getFailed();

    let retried = 0;
    for (const job of failed) {
      await job.retry();
      retried++;
    }

    logger.info(`Retried ${retried} failed ${queueType} jobs`);
    return retried;
  }

  public async clearQueue(queueType: 'email' | 'sms'): Promise<void> {
    const queue = queueType === 'email' ? this.emailQueue : this.smsQueue;
    await queue.empty();
    logger.info(`Cleared ${queueType} queue`);
  }

  public async close(): Promise<void> {
    await this.emailQueue.close();
    await this.smsQueue.close();
    logger.info('Notification queues closed');
  }
}

export default new NotificationQueue();
