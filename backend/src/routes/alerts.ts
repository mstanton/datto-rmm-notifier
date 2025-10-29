import { Router } from 'express';
import alertController from '../controllers/alertController';

const router = Router();

// GET /api/alerts - Get all alerts with filtering
router.get('/', alertController.getAlerts);

// GET /api/alerts/critical - Get critical alerts
router.get('/critical', alertController.getCriticalAlerts);

// GET /api/alerts/statistics - Get alert statistics
router.get('/statistics', alertController.getStatistics);

// POST /api/alerts/poll - Trigger manual poll
router.post('/poll', alertController.manualPoll);

// GET /api/alerts/:id - Get single alert
router.get('/:id', alertController.getAlert);

// POST /api/alerts/:id/resolve - Resolve an alert
router.post('/:id/resolve', alertController.resolveAlert);

export default router;
