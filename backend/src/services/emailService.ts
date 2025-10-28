import nodemailer, { Transporter } from 'nodemailer';
import Handlebars from 'handlebars';
import config from '../config';
import logger from '../utils/logger';
import { TemplateVariables } from '../../../shared/types';

class EmailService {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: {
        user: config.email.smtp.user,
        pass: config.email.smtp.password,
      },
    });

    // Verify transporter configuration
    this.verifyConnection();
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      logger.info('Email service SMTP connection verified');
    } catch (error) {
      logger.error('Email service SMTP connection failed', error);
    }
  }

  public async sendEmail(
    to: string,
    subject: string,
    bodyText: string,
    bodyHtml?: string
  ): Promise<{ messageId: string }> {
    try {
      const info = await this.transporter.sendMail({
        from: `"${config.email.from.name}" <${config.email.from.email}>`,
        to,
        subject,
        text: bodyText,
        html: bodyHtml || bodyText,
      });

      logger.info(`Email sent to ${to}`, { messageId: info.messageId });
      return { messageId: info.messageId };
    } catch (error) {
      logger.error(`Failed to send email to ${to}`, error);
      throw error;
    }
  }

  public async sendTemplatedEmail(
    to: string,
    subject: string,
    bodyTextTemplate: string,
    bodyHtmlTemplate: string | undefined,
    variables: Partial<TemplateVariables>
  ): Promise<{ messageId: string }> {
    try {
      // Compile templates
      const textTemplate = Handlebars.compile(bodyTextTemplate);
      const htmlTemplate = bodyHtmlTemplate ? Handlebars.compile(bodyHtmlTemplate) : null;

      // Render templates with variables
      const renderedText = textTemplate(variables);
      const renderedHtml = htmlTemplate ? htmlTemplate(variables) : undefined;
      const renderedSubject = Handlebars.compile(subject)(variables);

      return await this.sendEmail(to, renderedSubject, renderedText, renderedHtml);
    } catch (error) {
      logger.error(`Failed to send templated email to ${to}`, error);
      throw error;
    }
  }

  public compileTemplate(template: string, variables: Partial<TemplateVariables>): string {
    const compiled = Handlebars.compile(template);
    return compiled(variables);
  }

  public async sendBulkEmails(
    recipients: { email: string; subject: string; body: string; bodyHtml?: string }[]
  ): Promise<{ successful: number; failed: number }> {
    let successful = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        await this.sendEmail(recipient.email, recipient.subject, recipient.body, recipient.bodyHtml);
        successful++;
      } catch (error) {
        failed++;
        logger.error(`Failed to send bulk email to ${recipient.email}`, error);
      }
    }

    logger.info(`Bulk email send completed. Successful: ${successful}, Failed: ${failed}`);
    return { successful, failed };
  }
}

export default new EmailService();
