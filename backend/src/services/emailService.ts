import nodemailer, { Transporter } from 'nodemailer';
import Handlebars from 'handlebars';
import logger from '../config/logger';

class EmailService {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      } : undefined,
    });

    // Register Handlebars helpers
    this.registerHelpers();
  }

  /**
   * Register Handlebars helpers for template processing
   */
  private registerHelpers() {
    Handlebars.registerHelper('if', function(this: any, conditional, options) {
      if (conditional) {
        return options.fn(this);
      }
      return options.inverse(this);
    });

    Handlebars.registerHelper('eq', function(a, b) {
      return a === b;
    });

    Handlebars.registerHelper('formatDate', function(date) {
      if (!date) return '';
      return new Date(date).toLocaleString();
    });
  }

  /**
   * Send email
   */
  async sendEmail(
    to: string | string[],
    subject: string,
    htmlBody: string,
    textBody?: string
  ): Promise<boolean> {
    try {
      const from = process.env.SMTP_FROM || 'noreply@datto-alerts.com';

      const info = await this.transporter.sendMail({
        from,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        text: textBody || this.htmlToText(htmlBody),
        html: htmlBody,
      });

      logger.info(`Email sent successfully to ${to}. Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error('Failed to send email:', error);
      return false;
    }
  }

  /**
   * Send templated email
   */
  async sendTemplatedEmail(
    to: string | string[],
    subject: string,
    template: string,
    variables: Record<string, any>
  ): Promise<boolean> {
    try {
      // Compile subject template
      const subjectTemplate = Handlebars.compile(subject);
      const compiledSubject = subjectTemplate(variables);

      // Compile body template
      const bodyTemplate = Handlebars.compile(template);
      const htmlBody = bodyTemplate(variables);

      return await this.sendEmail(to, compiledSubject, htmlBody);
    } catch (error) {
      logger.error('Failed to send templated email:', error);
      return false;
    }
  }

  /**
   * Convert HTML to plain text (simple implementation)
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Verify SMTP connection
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('SMTP connection verified successfully');
      return true;
    } catch (error) {
      logger.error('SMTP connection verification failed:', error);
      return false;
    }
  }

  /**
   * Send test email
   */
  async sendTestEmail(to: string): Promise<boolean> {
    const subject = 'Datto RMM Notifier - Test Email';
    const htmlBody = `
      <html>
        <body>
          <h2>Test Email</h2>
          <p>This is a test email from Datto RMM Critical Alerts Notification System.</p>
          <p>If you receive this email, your SMTP configuration is working correctly.</p>
          <hr>
          <p><small>Sent at: ${new Date().toLocaleString()}</small></p>
        </body>
      </html>
    `;

    return await this.sendEmail(to, subject, htmlBody);
  }
}

export default new EmailService();
