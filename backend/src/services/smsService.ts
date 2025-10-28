import twilio from 'twilio';
import Handlebars from 'handlebars';
import config from '../config';
import logger from '../utils/logger';
import { TemplateVariables } from '../../../shared/types';

class SmsService {
  private client: twilio.Twilio;
  private fromNumber: string;
  private readonly SMS_MAX_LENGTH = 160;

  constructor() {
    this.client = twilio(config.twilio.accountSid, config.twilio.authToken);
    this.fromNumber = config.twilio.phoneNumber;

    logger.info('SMS service initialized with Twilio');
  }

  private validatePhoneNumber(phoneNumber: string): boolean {
    // E.164 format validation: +1XXXXXXXXXX
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber);
  }

  private truncateMessage(message: string): string {
    if (message.length <= this.SMS_MAX_LENGTH) {
      return message;
    }

    // Truncate and add ellipsis
    return message.substring(0, this.SMS_MAX_LENGTH - 3) + '...';
  }

  public async sendSms(to: string, message: string): Promise<{ messageSid: string }> {
    try {
      if (!this.validatePhoneNumber(to)) {
        throw new Error(`Invalid phone number format: ${to}. Must be E.164 format (e.g., +1234567890)`);
      }

      const truncatedMessage = this.truncateMessage(message);

      const result = await this.client.messages.create({
        body: truncatedMessage,
        from: this.fromNumber,
        to: to,
      });

      logger.info(`SMS sent to ${to}`, { messageSid: result.sid, status: result.status });
      return { messageSid: result.sid };
    } catch (error) {
      logger.error(`Failed to send SMS to ${to}`, error);
      throw error;
    }
  }

  public async sendTemplatedSms(
    to: string,
    template: string,
    variables: Partial<TemplateVariables>
  ): Promise<{ messageSid: string }> {
    try {
      const compiled = Handlebars.compile(template);
      const message = compiled(variables);

      return await this.sendSms(to, message);
    } catch (error) {
      logger.error(`Failed to send templated SMS to ${to}`, error);
      throw error;
    }
  }

  public async getMessageStatus(messageSid: string): Promise<string> {
    try {
      const message = await this.client.messages(messageSid).fetch();
      return message.status;
    } catch (error) {
      logger.error(`Failed to fetch SMS status for ${messageSid}`, error);
      throw error;
    }
  }

  public async sendBulkSms(
    recipients: { phone: string; message: string }[]
  ): Promise<{ successful: number; failed: number }> {
    let successful = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        await this.sendSms(recipient.phone, recipient.message);
        successful++;
        // Rate limiting: small delay between messages
        await this.sleep(100);
      } catch (error) {
        failed++;
        logger.error(`Failed to send bulk SMS to ${recipient.phone}`, error);
      }
    }

    logger.info(`Bulk SMS send completed. Successful: ${successful}, Failed: ${failed}`);
    return { successful, failed };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public compileTemplate(template: string, variables: Partial<TemplateVariables>): string {
    const compiled = Handlebars.compile(template);
    return this.truncateMessage(compiled(variables));
  }
}

export default new SmsService();
