import { Router } from 'express';
import fs from 'fs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { writeAudit } from '../lib/audit';
import { blockReadOnly } from '../middleware/readOnly';
import { upload, resolveUploadPath } from '../lib/uploads';
import { checkDepartmentBudgetThreshold } from '../lib/notify';

const router = Router();
router.use(requireAuth);

const expenseSchema = z.object({
  departmentId: z.string().uuid().optional(),
  deptHeadId: z.string().uuid().optional().nullable().or(z.literal('')),
  vendorId: z.string().uuid().optional().nullable(),
  vendorName: z.string().optional(),
  categoryId: z.string().uuid(),
  invoiceNo: z.string().optional().nullable(),
  invoiceDate: z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), 'Invalid date'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  gstAmount: z.coerce.number().min(0, 'GST cannot be negative').optional().nullable(),
  paymentMode: z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'UPI', 'BANK_TRANSFER', 'PAYPAL', 'CASH', 'CHEQUE', 'OTHERS']),
  paymentDetails: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  fyId: z.string().uuid(),
  status: z.enum(['DRAFT', 'SUBMITTED']).optional(),
});

const expenseUpdateSchema = expenseSchema
  .omit({ vendorName: true, fyId: true })
  .partial()
  .extend({
    vendorId: z.string().uuid().nullable().optional().or(z.literal('')),
    invoiceNo: z.string().nullable().optional(),
    paymentDetails: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  });

// A submitted expense must name a head when its department has active heads,
// so per-head spend stays exact. Drafts can leave it blank.
async function validateDeptHead(
  departmentId: string,
  deptHeadId: string | null,
  status: 'DRAFT' | 'SUBMITTED'
): Promise<string | null> {
  if (deptHeadId) {
    const head = await prisma.departmentHead.findUnique({ where: { id: deptHeadId } });
    if (!head || head.departmentId !== departmentId) return 'Selected head does not belong to the department';
    if (!head.isActive) return 'Selected department head is inactive';
    return null;
  }
  if (status === 'DRAFT') return null;
  const activeHeads = await prisma.departmentHead.count({ where: { departmentId, isActive: true } });
  return activeHeads > 0 ? 'Department head is required for this department' : null;
}

// Can `user` see this expense? Mirrors the scoping rules of the list route.
function canViewExpense(
  user: { sub: string; role: string; departmentId: string | null },
  expense: { userId: string; departmentId: string }
): boolean {
  if (user.role === 'ADMIN' || user.role === 'ACCOUNTS') return true;
  if (expense.userId === user.sub) return true;
  if (user.role === 'MANAGER' || user.role === 'DEPARTMENT_HEAD') {
    return !!user.departmentId && expense.departmentId === user.departmentId;
  }
  return false;
}

async function validateInvoiceDateInFy(fyId: string, invoiceDate: Date): Promise<string | null> {
  const fy = await prisma.financialYear.findUnique({ where: { id: fyId } });
  if (!fy) return 'Financial year not found';
  if (invoiceDate < fy.startDate || invoiceDate > fy.endDate) {
    return `Invoice date must fall within ${fy.label}`;
  }
  return null;
}

router.get('/', async (req, res) => {
  const { departmentId, categoryId, vendorId, from, to, mine, paymentMode, fyId, amountMin, amountMax, q, limit, status } = req.query;
  const user = req.user!;

  const where: any = {};
  if (status === 'DRAFT' || status === 'SUBMITTED') where.status = String(status);
  if (categoryId) where.categoryId = String(categoryId);
  if (vendorId) where.vendorId = String(vendorId);
  if (paymentMode) where.paymentMode = String(paymentMode);
  if (fyId) where.fyId = String(fyId);
  if (from || to) where.invoiceDate = { ...(from && { gte: new Date(String(from)) }), ...(to && { lte: new Date(String(to)) }) };
  if (amountMin || amountMax) {
    where.amount = {
      ...(amountMin && { gte: Number(amountMin) }),
      ...(amountMax && { lte: Number(amountMax) }),
    };
  }
  if (q) {
    const term = String(q);
    where.OR = [
      { invoiceNo: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      { vendor: { name: { contains: term, mode: 'insensitive' } } },
    ];
  }

  if (user.role === 'EMPLOYEE' || mine === 'true') {
    where.userId = user.sub;
  } else if (user.role === 'MANAGER') {
    const scope = { OR: [{ userId: user.sub }, { department: { id: user.departmentId ?? undefined } }] };
    where.AND = [...(where.AND ?? []), scope];
  } else if (user.role === 'DEPARTMENT_HEAD') {
    where.departmentId = user.departmentId ?? undefined;
  } else if ((user.role === 'ADMIN' || user.role === 'ACCOUNTS') && departmentId) {
    where.departmentId = String(departmentId);
  }

  // Drafts are private to their creator; admins see everything.
  if (user.role !== 'ADMIN') {
    where.AND = [...(where.AND ?? []), { OR: [{ status: 'SUBMITTED' }, { userId: user.sub }] }];
  }

  const take = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  const expenses = await prisma.expense.findMany({
    where,
    include: {
      vendor: true,
      category: true,
      department: true,
      deptHead: true,
      user: { select: { id: true, name: true, email: true } },
      attachments: true,
    },
    orderBy: { createdAt: 'desc' },
    take,
  });
  res.json(expenses);
});

// Authenticated, access-checked attachment download (files are not served statically).
router.get('/attachments/:attachmentId', async (req, res) => {
  const attachment = await prisma.expenseAttachment.findUnique({
    where: { id: String(req.params.attachmentId) },
    include: { expense: { select: { userId: true, departmentId: true } } },
  });
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
  if (!canViewExpense(req.user!, attachment.expense)) {
    return res.status(403).json({ error: 'You do not have access to this attachment' });
  }

  const filePath = resolveUploadPath(attachment.filePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File is missing on the server' });

  res.setHeader('Content-Type', attachment.fileType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.fileName)}"`);
  fs.createReadStream(filePath).pipe(res);
});

router.get('/:id', async (req, res) => {
  const expense = await prisma.expense.findUnique({
    where: { id: String(req.params.id) },
    include: {
      vendor: true,
      category: true,
      department: true,
      deptHead: true,
      user: { select: { id: true, name: true, email: true, departmentId: true } },
      attachments: true,
    },
  });
  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  if (!canViewExpense(req.user!, expense)) {
    return res.status(403).json({ error: 'You do not have access to this expense' });
  }
  // Drafts are private to their creator (admins excepted).
  if (expense.status === 'DRAFT' && expense.userId !== req.user!.sub && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'You do not have access to this expense' });
  }
  res.json(expense);
});

router.post('/', blockReadOnly, upload.array('attachments', 10), async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;
  const user = req.user!;

  const departmentId = data.departmentId || user.departmentId;
  if (!departmentId) return res.status(400).json({ error: 'Department is required' });

  const status = data.status ?? 'SUBMITTED';
  const deptHeadId = data.deptHeadId || null;
  const headError = await validateDeptHead(departmentId, deptHeadId, status);
  if (headError) return res.status(400).json({ error: headError });

  const invoiceDate = new Date(data.invoiceDate);
  const fyError = await validateInvoiceDateInFy(data.fyId, invoiceDate);
  if (fyError) return res.status(400).json({ error: fyError });

  let vendorId = data.vendorId ?? null;
  if (!vendorId && data.vendorName) {
    const existing = await prisma.vendor.findFirst({
      where: { name: { equals: data.vendorName, mode: 'insensitive' } },
    });
    const vendor = existing ?? (await prisma.vendor.create({ data: { name: data.vendorName } }));
    vendorId = vendor.id;
  }

  // Duplicate detection: same vendor + invoice number, or same vendor + amount on the same day.
  let duplicateWarning = null;
  if (vendorId) {
    const dayStart = new Date(invoiceDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const or: any[] = [{ AND: [{ amount: data.amount }, { invoiceDate: { gte: dayStart, lt: dayEnd } }] }];
    if (data.invoiceNo) or.unshift({ invoiceNo: data.invoiceNo });

    const candidates = await prisma.expense.findMany({ where: { vendorId, OR: or }, take: 5 });
    if (candidates.length > 0) {
      duplicateWarning = `Found ${candidates.length} similar expense(s) from this vendor with matching invoice number, or the same amount on the same date.`;
    }
  }

  const files = (req.files as Express.Multer.File[]) || [];

  const expense = await prisma.expense.create({
    data: {
      userId: user.sub,
      departmentId,
      deptHeadId,
      status,
      vendorId,
      categoryId: data.categoryId,
      invoiceNo: data.invoiceNo || null,
      invoiceDate,
      amount: data.amount,
      currency: 'INR',
      gstAmount: data.gstAmount ?? null,
      paymentMode: data.paymentMode,
      paymentDetails: data.paymentDetails || null,
      description: data.description || null,
      fyId: data.fyId,
      attachments: {
        create: files.map((f) => ({ filePath: f.filename, fileType: f.mimetype, fileName: f.originalname })),
      },
    },
    include: { attachments: true },
  });

  await writeAudit(user.sub, 'CREATE', 'Expense', expense.id, undefined, expense, req.ip);

  // Budget threshold alerts run after the response; previous spend = new total
  // minus this expense. Drafts don't count toward budgets.
  if (status === 'SUBMITTED') {
    setImmediate(async () => {
      try {
        const total = await prisma.expense.aggregate({
          where: { departmentId, fyId: data.fyId, status: 'SUBMITTED' },
          _sum: { amount: true },
        });
        await checkDepartmentBudgetThreshold(departmentId, data.fyId, (total._sum.amount ?? 0) - expense.amount);
      } catch (e) {
        console.error('budget threshold check failed', e);
      }
    });
  }

  res.status(201).json({ expense, duplicateWarning });
});

router.put('/:id', blockReadOnly, async (req, res) => {
  const existing = await prisma.expense.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'Expense not found' });
  if (existing.userId !== req.user!.sub && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Cannot edit another user\'s expense' });
  }

  const parsed = expenseUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  // Submitted expenses can't be reverted to draft (their spend already counted).
  const nextStatus = data.status ?? existing.status;
  if (existing.status === 'SUBMITTED' && nextStatus === 'DRAFT') {
    return res.status(400).json({ error: 'A submitted expense cannot be moved back to draft' });
  }

  const departmentId = data.departmentId ?? existing.departmentId;
  const deptHeadId = data.deptHeadId !== undefined ? data.deptHeadId || null : existing.deptHeadId;
  // Re-validate the head when submitting, or when dept/head changed.
  const headError = await validateDeptHead(departmentId, deptHeadId, nextStatus);
  if (headError) return res.status(400).json({ error: headError });

  if (data.invoiceDate) {
    const fyError = await validateInvoiceDateInFy(existing.fyId, new Date(data.invoiceDate));
    if (fyError) return res.status(400).json({ error: fyError });
  }

  const expense = await prisma.expense.update({
    where: { id: String(req.params.id) },
    data: {
      departmentId: data.departmentId,
      deptHeadId,
      status: nextStatus,
      vendorId: data.vendorId || null,
      categoryId: data.categoryId,
      invoiceNo: data.invoiceNo || null,
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : undefined,
      amount: data.amount,
      gstAmount: data.gstAmount ?? undefined,
      paymentMode: data.paymentMode,
      paymentDetails: data.paymentDetails,
      description: data.description,
    },
  });
  await writeAudit(req.user!.sub, 'UPDATE', 'Expense', expense.id, existing, expense, req.ip);

  // Draft→submitted is when the spend starts counting: run threshold alerts.
  if (existing.status === 'DRAFT' && expense.status === 'SUBMITTED') {
    setImmediate(async () => {
      try {
        const total = await prisma.expense.aggregate({
          where: { departmentId: expense.departmentId, fyId: expense.fyId, status: 'SUBMITTED' },
          _sum: { amount: true },
        });
        await checkDepartmentBudgetThreshold(expense.departmentId, expense.fyId, (total._sum.amount ?? 0) - expense.amount);
      } catch (e) {
        console.error('budget threshold check failed', e);
      }
    });
  }

  res.json(expense);
});

// Deleting expenses is an admin-only operation.
router.delete('/:id', blockReadOnly, async (req, res) => {
  if (req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only admins can delete expenses' });
  }

  const existing = await prisma.expense.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'Expense not found' });

  await prisma.expense.delete({ where: { id: existing.id } });

  await writeAudit(req.user!.sub, 'DELETE', 'Expense', existing.id, existing, undefined, req.ip);
  res.status(204).end();
});

export default router;
