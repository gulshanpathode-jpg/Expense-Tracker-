import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const user = req.user!;
  const { unreadOnly } = req.query;
  const notifications = await prisma.notification.findMany({
    where: { userId: user.sub, isRead: unreadOnly === 'true' ? false : undefined },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(notifications);
});

router.get('/unread-count', async (req, res) => {
  const count = await prisma.notification.count({ where: { userId: req.user!.sub, isRead: false } });
  res.json({ count });
});

router.post('/:id/read', async (req, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: String(req.params.id) } });
  if (!notification || notification.userId !== req.user!.sub) {
    return res.status(404).json({ error: 'Notification not found' });
  }
  const updated = await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
  res.json(updated);
});

router.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.sub, isRead: false }, data: { isRead: true } });
  res.status(204).end();
});

export default router;
