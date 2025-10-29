import { Router } from 'express';
import notificationController from '../controllers/notificationController';

const router = Router();

// GET /api/notifications - Get all notifications
router.get('/', notificationController.getNotifications);

// GET /api/notifications/statistics - Get notification statistics
router.get('/statistics', notificationController.getStatistics);

// GET /api/notifications/queue-stats - Get queue statistics
router.get('/queue-stats', notificationController.getQueueStats);

// POST /api/notifications/alert/:alertId - Send notification for an alert
router.post('/alert/:alertId', notificationController.sendNotification);

export default router;
