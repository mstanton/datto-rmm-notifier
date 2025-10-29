import { Contact } from '../types/models';
import db from '../config/database';

class ContactRepository {
  /**
   * Create a new contact
   */
  async create(contact: Omit<Contact, 'id' | 'created_at' | 'updated_at'>): Promise<Contact> {
    const result = await db.query<Contact>(
      `INSERT INTO contacts (
        site_uid, site_name, name, email, phone, role,
        notification_preferences, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        contact.site_uid,
        contact.site_name,
        contact.name,
        contact.email,
        contact.phone,
        contact.role,
        JSON.stringify(contact.notification_preferences),
        contact.active,
      ]
    );

    return result.rows[0];
  }

  /**
   * Find contact by ID
   */
  async findById(id: string): Promise<Contact | null> {
    const result = await db.query<Contact>(
      'SELECT * FROM contacts WHERE id = $1',
      [id]
    );

    return result.rows[0] || null;
  }

  /**
   * Find contacts by site
   */
  async findBySiteUid(siteUid: string, activeOnly = true): Promise<Contact[]> {
    const query = activeOnly
      ? 'SELECT * FROM contacts WHERE site_uid = $1 AND active = true ORDER BY name'
      : 'SELECT * FROM contacts WHERE site_uid = $1 ORDER BY name';

    const result = await db.query<Contact>(query, [siteUid]);
    return result.rows;
  }

  /**
   * Get all contacts with filtering
   */
  async findAll(filters: {
    siteUid?: string;
    active?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ contacts: Contact[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (filters.siteUid) {
      conditions.push(`site_uid = $${paramCount}`);
      values.push(filters.siteUid);
      paramCount++;
    }

    if (filters.active !== undefined) {
      conditions.push(`active = $${paramCount}`);
      values.push(filters.active);
      paramCount++;
    }

    if (filters.search) {
      conditions.push(`(
        name ILIKE $${paramCount} OR
        email ILIKE $${paramCount} OR
        site_name ILIKE $${paramCount}
      )`);
      values.push(`%${filters.search}%`);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as count FROM contacts ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const result = await db.query<Contact>(
      `SELECT * FROM contacts ${whereClause}
       ORDER BY site_name, name
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...values, limit, offset]
    );

    return { contacts: result.rows, total };
  }

  /**
   * Update contact
   */
  async update(id: string, updates: Partial<Contact>): Promise<Contact | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount}`);
      values.push(updates.name);
      paramCount++;
    }

    if (updates.email !== undefined) {
      fields.push(`email = $${paramCount}`);
      values.push(updates.email);
      paramCount++;
    }

    if (updates.phone !== undefined) {
      fields.push(`phone = $${paramCount}`);
      values.push(updates.phone);
      paramCount++;
    }

    if (updates.role !== undefined) {
      fields.push(`role = $${paramCount}`);
      values.push(updates.role);
      paramCount++;
    }

    if (updates.notification_preferences !== undefined) {
      fields.push(`notification_preferences = $${paramCount}`);
      values.push(JSON.stringify(updates.notification_preferences));
      paramCount++;
    }

    if (updates.active !== undefined) {
      fields.push(`active = $${paramCount}`);
      values.push(updates.active);
      paramCount++;
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = await db.query<Contact>(
      `UPDATE contacts SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  /**
   * Delete contact
   */
  async delete(id: string): Promise<boolean> {
    const result = await db.query(
      'DELETE FROM contacts WHERE id = $1',
      [id]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Get contacts for email notification
   */
  async getEmailContacts(siteUid: string): Promise<Contact[]> {
    const result = await db.query<Contact>(
      `SELECT * FROM contacts
       WHERE site_uid = $1
       AND active = true
       AND notification_preferences->>'email' = 'true'`,
      [siteUid]
    );

    return result.rows;
  }

  /**
   * Get contacts for SMS notification
   */
  async getSmsContacts(siteUid: string): Promise<Contact[]> {
    const result = await db.query<Contact>(
      `SELECT * FROM contacts
       WHERE site_uid = $1
       AND active = true
       AND phone IS NOT NULL
       AND notification_preferences->>'sms' = 'true'`,
      [siteUid]
    );

    return result.rows;
  }
}

export default new ContactRepository();
