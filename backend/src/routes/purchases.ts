import { Router } from 'express';
import fs from 'fs';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { blockReadOnly } from '../middleware/readOnly';
import { writeAudit } from '../lib/audit';
import { notify } from '../lib/notify';
import { upload, resolveUploadPath } from '../lib/uploads';

const router = Router();
router.use(requireAuth);

// Can `user` see this purchase request? Mirrors the list scoping.
function canViewRequest(
  user: { sub: string; role: string; departmentId: string | null },
  request: { requestedById: string; departmentId: string }
): boolean {
  if (user.role === 'ADMIN' || user.role === 'ACCOUNTS') return true;
  if (request.requestedById === user.sub) return true;
  return !!user.departmentId && request.departmentId === user.departmentId;
}

function canViewOrder(
  user: { role: string; departmentId: string | null },
  order: { departmentId: string }
): boolean {
  if (user.role === 'ADMIN' || user.role === 'ACCOUNTS') return true;
  return !!user.departmentId && order.departmentId === user.departmentId;
}

// ---- Purchase Requests ----

router.get('/requests', async (req, res) => {
  const user = req.user!;
  const { status, departmentId } = req.query;
  const where: any = {};
  if (status) where.status = String(status);

  if (user.role === 'EMPLOYEE' || user.role === 'MANAGER') {
    where.OR = [{ requestedById: user.sub }, { departmentId: user.departmentId ?? undefined }];
  } else if (user.role === 'DEPARTMENT_HEAD') {
    where.departmentId = user.departmentId ?? undefined;
  } else if (departmentId) {
    where.departmentId = String(departmentId);
  }

  const requests = await prisma.purchaseRequest.findMany({
    where,
    include: {
      requestedBy: { select: { id: true, name: true, email: true } },
      approver: { select: { id: true, name: true } },
      department: true,
      costCenter: true,
      items: true,
      purchaseOrders: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  res.json(requests);
});

router.get('/requests/:id', async (req, res) => {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: String(req.params.id) },
    include: {
      requestedBy: { select: { id: true, name: true, email: true } },
      approver: { select: { id: true, name: true } },
      department: true,
      costCenter: true,
      items: true,
      purchaseOrders: { include: { vendor: true } },
    },
  });
  if (!request) return res.status(404).json({ error: 'Purchase request not found' });
  if (!canViewRequest(req.user!, request)) {
    return res.status(403).json({ error: 'You do not have access to this purchase request' });
  }
  res.json(request);
});

router.post('/requests', blockReadOnly, async (req, res) => {
  const { departmentId, costCenterId, title, justification, estimatedAmount, items } = req.body;
  const user = req.user!;
  const deptId = departmentId || user.departmentId;
  if (!deptId) return res.status(400).json({ error: 'departmentId is required' });
  if (!title || typeof estimatedAmount !== 'number' || estimatedAmount <= 0) {
    return res.status(400).json({ error: 'title and a positive estimatedAmount are required' });
  }

  const request = await prisma.purchaseRequest.create({
    data: {
      requestedById: user.sub,
      departmentId: deptId,
      costCenterId: costCenterId || null,
      title,
      justification: justification || null,
      estimatedAmount,
      status: 'DRAFT',
      items: {
        create: Array.isArray(items)
          ? items.map((i: any) => ({
              description: i.description,
              quantity: Number(i.quantity) || 1,
              estimatedUnitCost: Number(i.estimatedUnitCost) || 0,
            }))
          : [],
      },
    },
    include: { items: true },
  });

  await writeAudit(user.sub, 'CREATE', 'PurchaseRequest', request.id, undefined, request, req.ip);
  res.status(201).json(request);
});

router.post('/requests/:id/submit', blockReadOnly, async (req, res) => {
  const request = await prisma.purchaseRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!request) return res.status(404).json({ error: 'Purchase request not found' });
  if (request.requestedById !== req.user!.sub && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Not your purchase request' });
  }
  if (request.status !== 'DRAFT') return res.status(400).json({ error: 'Only draft requests can be submitted' });

  // Department head approves; fall back to an admin so requests can't get stuck unassigned.
  const deptHead = await prisma.user.findFirst({
    where: { departmentId: request.departmentId, role: 'DEPARTMENT_HEAD', isActive: true },
  });
  const fallbackAdmin = deptHead
    ? null
    : await prisma.user.findFirst({
        where: { role: 'ADMIN', isActive: true, id: { not: request.requestedById } },
        orderBy: { createdAt: 'asc' },
      });
  const approverId = deptHead?.id ?? fallbackAdmin?.id ?? null;
  if (!approverId) {
    return res.status(400).json({ error: 'No approver is available for this department. Contact an administrator.' });
  }

  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: { status: 'PENDING', approverId },
  });

  await notify(approverId, 'PR_APPROVAL', `A purchase request "${request.title}" is pending your approval.`, `/purchases/requests/${request.id}`);
  res.json(updated);
});

function canActOnRequest(
  user: { sub: string; role: string; departmentId: string | null },
  request: { approverId: string | null; departmentId: string }
): boolean {
  if (user.role === 'ADMIN') return true;
  if (request.approverId) return request.approverId === user.sub;
  return user.role === 'DEPARTMENT_HEAD' && !!user.departmentId && user.departmentId === request.departmentId;
}

router.post('/requests/:id/approve', requireRole('DEPARTMENT_HEAD', 'ADMIN'), async (req, res) => {
  const request = await prisma.purchaseRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!request) return res.status(404).json({ error: 'Purchase request not found' });
  if (request.status !== 'PENDING') return res.status(400).json({ error: 'Request is not pending approval' });
  if (!canActOnRequest(req.user!, request)) {
    return res.status(403).json({ error: 'You are not the approver for this purchase request' });
  }

  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: { status: 'APPROVED', approvedAt: new Date(), comments: req.body?.comments || null },
  });
  await writeAudit(req.user!.sub, 'APPROVE', 'PurchaseRequest', request.id, undefined, updated, req.ip);
  await notify(request.requestedById, 'PR_APPROVAL', `Your purchase request "${request.title}" was approved.`, `/purchases/requests/${request.id}`);
  res.json(updated);
});

router.post('/requests/:id/reject', requireRole('DEPARTMENT_HEAD', 'ADMIN'), async (req, res) => {
  if (!req.body?.comments) return res.status(400).json({ error: 'Rejection comments are required' });
  const request = await prisma.purchaseRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!request) return res.status(404).json({ error: 'Purchase request not found' });
  if (request.status !== 'PENDING') return res.status(400).json({ error: 'Request is not pending approval' });
  if (!canActOnRequest(req.user!, request)) {
    return res.status(403).json({ error: 'You are not the approver for this purchase request' });
  }

  const updated = await prisma.purchaseRequest.update({
    where: { id: request.id },
    data: { status: 'REJECTED', comments: req.body.comments },
  });
  await writeAudit(req.user!.sub, 'REJECT', 'PurchaseRequest', request.id, undefined, updated, req.ip);
  await notify(request.requestedById, 'PR_APPROVAL', `Your purchase request "${request.title}" was rejected. Reason: ${req.body.comments}`, `/purchases/requests/${request.id}`);
  res.json(updated);
});

// ---- Purchase Orders ----

router.get('/orders', async (req, res) => {
  const { status, departmentId, vendorId } = req.query;
  const where: any = {};
  if (status) where.status = String(status);
  if (departmentId) where.departmentId = String(departmentId);
  if (vendorId) where.vendorId = String(vendorId);

  const user = req.user!;
  if (user.role === 'DEPARTMENT_HEAD' || user.role === 'MANAGER' || user.role === 'EMPLOYEE') {
    where.departmentId = user.departmentId ?? undefined;
  }

  const orders = await prisma.purchaseOrder.findMany({
    where,
    include: { vendor: true, department: true, createdBy: { select: { id: true, name: true } }, deliveries: true, purchaseRequest: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  res.json(orders);
});

router.get('/orders/:id', async (req, res) => {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: String(req.params.id) },
    include: {
      vendor: true,
      department: true,
      createdBy: { select: { id: true, name: true } },
      deliveries: { include: { recordedBy: { select: { id: true, name: true } } }, orderBy: { deliveredAt: 'desc' } },
      purchaseRequest: true,
      invoiceExpense: true,
    },
  });
  if (!order) return res.status(404).json({ error: 'Purchase order not found' });
  if (!canViewOrder(req.user!, order)) {
    return res.status(403).json({ error: 'You do not have access to this purchase order' });
  }
  res.json(order);
});

// Authenticated, access-checked quotation download.
router.get('/orders/:id/quotation', async (req, res) => {
  const order = await prisma.purchaseOrder.findUnique({ where: { id: String(req.params.id) } });
  if (!order) return res.status(404).json({ error: 'Purchase order not found' });
  if (!canViewOrder(req.user!, order)) {
    return res.status(403).json({ error: 'You do not have access to this purchase order' });
  }
  if (!order.quotationFilePath) return res.status(404).json({ error: 'No quotation attached' });

  const filePath = resolveUploadPath(order.quotationFilePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File is missing on the server' });

  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(order.quotationFileName ?? 'quotation')}"`);
  fs.createReadStream(filePath).pipe(res);
});

function generatePoNumber() {
  return `PO-${Date.now().toString(36).toUpperCase()}-${Math.round(Math.random() * 1e4)}`;
}

// PO lifecycle is admin-only. (ACCOUNTS is a read-only role per spec, so listing it
// alongside blockReadOnly was contradictory — it could never actually act.)
router.post('/orders', requireRole('ADMIN'), upload.single('quotation'), async (req, res) => {
  const { purchaseRequestId, vendorId, departmentId, amount } = req.body;
  if (!vendorId || !departmentId || !amount || !(Number(amount) > 0)) {
    return res.status(400).json({ error: 'vendorId, departmentId and a positive amount are required' });
  }

  const order = await prisma.purchaseOrder.create({
    data: {
      poNumber: generatePoNumber(),
      purchaseRequestId: purchaseRequestId || null,
      vendorId,
      departmentId,
      amount: Number(amount),
      status: 'DRAFT',
      quotationFilePath: req.file?.filename,
      quotationFileName: req.file?.originalname,
      createdById: req.user!.sub,
    },
    include: { vendor: true },
  });

  await writeAudit(req.user!.sub, 'CREATE', 'PurchaseOrder', order.id, undefined, order, req.ip);
  res.status(201).json(order);
});

router.post('/orders/:id/issue', requireRole('ADMIN'), async (req, res) => {
  const order = await prisma.purchaseOrder.findUnique({ where: { id: String(req.params.id) } });
  if (!order) return res.status(404).json({ error: 'Purchase order not found' });
  if (order.status !== 'DRAFT') return res.status(400).json({ error: 'Only draft orders can be issued' });

  const updated = await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: { status: 'ISSUED', issuedAt: new Date() },
  });
  await writeAudit(req.user!.sub, 'ISSUE', 'PurchaseOrder', order.id, undefined, updated, req.ip);
  res.json(updated);
});

router.post('/orders/:id/deliveries', requireRole('ADMIN'), async (req, res) => {
  const { deliveredAmount, note } = req.body;
  const amount = Number(deliveredAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'deliveredAmount must be a positive number' });
  }

  try {
    const delivery = await prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({ where: { id: String(req.params.id) }, include: { deliveries: true } });
      if (!order) throw Object.assign(new Error('Purchase order not found'), { status: 404 });
      if (!['ISSUED', 'PARTIALLY_DELIVERED'].includes(order.status)) {
        throw Object.assign(new Error('Order must be issued before recording delivery'), { status: 400 });
      }

      const alreadyDelivered = order.deliveries.reduce((s, d) => s + d.deliveredAmount, 0);
      if (alreadyDelivered + amount > order.amount + 0.005) {
        throw Object.assign(
          new Error(`Delivery exceeds the order amount (${order.amount - alreadyDelivered} remaining)`),
          { status: 400 },
        );
      }

      const created = await tx.purchaseOrderDelivery.create({
        data: { purchaseOrderId: order.id, deliveredAmount: amount, note: note || null, recordedById: req.user!.sub },
      });

      const newStatus = alreadyDelivered + amount >= order.amount ? 'DELIVERED' : 'PARTIALLY_DELIVERED';
      await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: newStatus } });
      return created;
    });

    await writeAudit(req.user!.sub, 'DELIVERY', 'PurchaseOrder', String(req.params.id), undefined, delivery, req.ip);
    res.status(201).json(delivery);
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

router.post('/orders/:id/map-invoice', requireRole('ADMIN'), async (req, res) => {
  const { expenseId } = req.body;
  if (!expenseId) return res.status(400).json({ error: 'expenseId is required' });

  const order = await prisma.purchaseOrder.findUnique({ where: { id: String(req.params.id) } });
  if (!order) return res.status(404).json({ error: 'Purchase order not found' });

  const expense = await prisma.expense.findUnique({ where: { id: String(expenseId) } });
  if (!expense) return res.status(404).json({ error: 'Expense not found' });

  const updated = await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: { invoiceExpenseId: expenseId },
  });
  await writeAudit(req.user!.sub, 'MAP_INVOICE', 'PurchaseOrder', order.id, undefined, updated, req.ip);
  res.json(updated);
});

export default router;
