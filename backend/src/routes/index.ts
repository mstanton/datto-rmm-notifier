import { Router } from 'express';
import alertRoutes from './alerts';
import contactRoutes from './contacts';
import notificationRoutes from './notifications';

const router = Router();

router.use('/alerts', alertRoutes);
router.use('/contacts', contactRoutes);
router.use('/notifications', notificationRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Datto RMM Notifier API is running',
    timestamp: new Date().toISOString(),
  });
});

export default router;
