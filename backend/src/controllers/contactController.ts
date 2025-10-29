import { Request, Response } from 'express';
import contactRepository from '../repositories/contactRepository';
import logger from '../config/logger';

class ContactController {
  /**
   * Get all contacts with filtering
   */
  async getContacts(req: Request, res: Response) {
    try {
      const {
        siteUid,
        active,
        search,
        page = '1',
        limit = '50',
      } = req.query;

      const filters: any = {};

      if (siteUid) filters.siteUid = siteUid as string;
      if (active !== undefined) filters.active = active === 'true';
      if (search) filters.search = search as string;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);

      filters.limit = limitNum;
      filters.offset = (pageNum - 1) * limitNum;

      const result = await contactRepository.findAll(filters);

      res.json({
        success: true,
        data: result.contacts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: result.total,
          pages: Math.ceil(result.total / limitNum),
        },
      });
    } catch (error) {
      logger.error('Error getting contacts:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve contacts' });
    }
  }

  /**
   * Get single contact by ID
   */
  async getContact(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const contact = await contactRepository.findById(id);

      if (!contact) {
        return res.status(404).json({ success: false, error: 'Contact not found' });
      }

      res.json({ success: true, data: contact });
    } catch (error) {
      logger.error('Error getting contact:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve contact' });
    }
  }

  /**
   * Get contacts by site
   */
  async getContactsBySite(req: Request, res: Response) {
    try {
      const { siteUid } = req.params;
      const { activeOnly = 'true' } = req.query;

      const contacts = await contactRepository.findBySiteUid(
        siteUid,
        activeOnly === 'true'
      );

      res.json({ success: true, data: contacts });
    } catch (error) {
      logger.error('Error getting contacts by site:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve contacts' });
    }
  }

  /**
   * Create new contact
   */
  async createContact(req: Request, res: Response) {
    try {
      const {
        siteUid,
        siteName,
        name,
        email,
        phone,
        role,
        notificationPreferences,
      } = req.body;

      // Validation
      if (!siteUid || !siteName || !name || !email) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: siteUid, siteName, name, email',
        });
      }

      const contact = await contactRepository.create({
        site_uid: siteUid,
        site_name: siteName,
        name,
        email,
        phone,
        role,
        notification_preferences: notificationPreferences || { email: true, sms: false },
        active: true,
      } as any);

      logger.info(`Contact created: ${contact.name} (${contact.email})`);

      res.status(201).json({ success: true, data: contact });
    } catch (error) {
      logger.error('Error creating contact:', error);
      res.status(500).json({ success: false, error: 'Failed to create contact' });
    }
  }

  /**
   * Update contact
   */
  async updateContact(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const contact = await contactRepository.update(id, updates);

      if (!contact) {
        return res.status(404).json({ success: false, error: 'Contact not found' });
      }

      logger.info(`Contact updated: ${contact.id}`);

      res.json({ success: true, data: contact });
    } catch (error) {
      logger.error('Error updating contact:', error);
      res.status(500).json({ success: false, error: 'Failed to update contact' });
    }
  }

  /**
   * Delete contact
   */
  async deleteContact(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const deleted = await contactRepository.delete(id);

      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Contact not found' });
      }

      logger.info(`Contact deleted: ${id}`);

      res.json({ success: true, message: 'Contact deleted successfully' });
    } catch (error) {
      logger.error('Error deleting contact:', error);
      res.status(500).json({ success: false, error: 'Failed to delete contact' });
    }
  }
}

export default new ContactController();
