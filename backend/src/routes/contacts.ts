import { Router } from 'express';
import contactController from '../controllers/contactController';

const router = Router();

// GET /api/contacts - Get all contacts
router.get('/', contactController.getContacts);

// POST /api/contacts - Create new contact
router.post('/', contactController.createContact);

// GET /api/contacts/site/:siteUid - Get contacts by site
router.get('/site/:siteUid', contactController.getContactsBySite);

// GET /api/contacts/:id - Get single contact
router.get('/:id', contactController.getContact);

// PUT /api/contacts/:id - Update contact
router.put('/:id', contactController.updateContact);

// DELETE /api/contacts/:id - Delete contact
router.delete('/:id', contactController.deleteContact);

export default router;
