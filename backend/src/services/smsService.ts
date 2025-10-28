import twilio from 'twilio';
import Handlebars from 'handlebars';
import logger from '../config/logger';

class SMSService {
  private client: any;
  private fromNumber: string;
  private isConfigured: boolean = false;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';

    if (accountSid && authToken && this.fromNumber) {
      this.client = twilio(accountSid, authToken);
      this.isConfigured = true;
      logger.info('Twilio SMS service configured successfully');
    } else {
      logger.warn('Twilio credentials not configured - SMS functionality disabled');
    }
  }

  /**
   * Send SMS
   */
  async sendSMS(to: string, message: string): Promise<boolean> {
    if (!this.isConfigured) {
      logger.error('SMS service not configured');
      return false;
    }

    try {
      // Validate phone number format (E.164)
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) {
        logger.error(`Invalid phone number format: ${to}`);
        return false;
      }

      // Truncate message to 160 characters
      const truncatedMessage = message.length > 160
        ? message.substring(0, 157) + '...'
        : message;

      const twilioMessage = await this.client.messages.create({
        body: truncatedMessage,
        from: this.fromNumber,
        to: formattedPhone,
      });

      logger.info(`SMS sent successfully to ${to}. SID: ${twilioMessage.sid}`);
      return true;
    } catch (error: any) {
      logger.error('Failed to send SMS:', error);

      // Log specific Twilio error codes
      if (error.code) {
        logger.error(`Twilio error code: ${error.code} - ${error.message}`);
      }

      return false;
    }
  }

  /**
   * Send templated SMS
   */
  async sendTemplatedSMS(
    to: string,
    template: string,
    variables: Record<string, any>
  ): Promise<boolean> {
    try {
      const messageTemplate = Handlebars.compile(template);
      const message = messageTemplate(variables);

      return await this.sendSMS(to, message);
    } catch (error) {
      logger.error('Failed to send templated SMS:', error);
      return false;
    }
  }

  /**
   * Format phone number to E.164 format
   */
  private formatPhoneNumber(phone: string): string | null {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');

    // If number doesn't start with country code, assume US (+1)
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    } else if (digits.startsWith('+')) {
      return phone; // Already formatted
    }

    // Return null for invalid formats
    return null;
  }

  /**
   * Validate phone number
   */
  validatePhoneNumber(phone: string): boolean {
    const formatted = this.formatPhoneNumber(phone);
    return formatted !== null;
  }

  /**
   * Send test SMS
   */
  async sendTestSMS(to: string): Promise<boolean> {
    const message = 'Test message from Datto RMM Notifier. Your SMS configuration is working!';
    return await this.sendSMS(to, message);
  }

  /**
   * Check if SMS service is configured
   */
  isReady(): boolean {
    return this.isConfigured;
  }
}

export default new SMSService();
