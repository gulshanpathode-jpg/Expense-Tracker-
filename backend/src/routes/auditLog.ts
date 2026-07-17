import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', async (req, res) => {
  const { userId, entityType, action, from, to } = req.query;
  const where: any = {};
  if (userId) where.userId = String(userId);
  if (entityType) where.entityType = String(entityType);
  if (action) where.action = String(action);
  if (from || to) {
    where.timestamp = {
      ...(from && { gte: new Date(String(from)) }),
      ...(to && { lte: new Date(String(to)) }),
    };
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { timestamp: 'desc' },
    take: 500,
  });
  res.json(logs);
});

export default router;
