import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { writeAudit } from '../lib/audit';
import { passwordSchema } from '../lib/password';

const router = Router();
router.use(requireAuth);

const vendorSchema = z.object({
  name: z.string().min(1),
  gstNo: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  bankAccountNo: z.string().optional().nullable(),
  bankIfsc: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

router.get('/departments', async (_req, res) => {
  res.json(
    await prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: { heads: { where: { isActive: true }, orderBy: { name: 'asc' } } },
    })
  );
});

const departmentCreateSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  // At least one head is required for every department.
  heads: z.array(z.string().min(1)).min(1, 'At least one department head is required'),
});

router.post('/departments', requireRole('ADMIN'), async (req, res) => {
  const parsed = departmentCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, code, parentId, heads } = parsed.data;

  const headNames = [...new Set(heads.map((h) => h.trim()).filter(Boolean))];
  if (headNames.length === 0) {
    return res.status(400).json({ error: 'At least one department head is required' });
  }
  const dept = await prisma.department.create({
    data: {
      code: code || null,
      name,
      parentId: parentId || null,
      heads: { create: headNames.map((h) => ({ name: h })) },
    },
    include: { heads: true },
  });
  await writeAudit(req.user!.sub, 'CREATE', 'Department', dept.id, undefined, dept, req.ip);
  res.status(201).json(dept);
});

router.put('/departments/:id', requireRole('ADMIN'), async (req, res) => {
  const { code, name, isActive, parentId } = req.body;
  const existing = await prisma.department.findUnique({ where: { id: String(req.params.id) } });
  const dept = await prisma.department.update({
    where: { id: String(req.params.id) },
    data: { code: code ?? undefined, name, isActive, parentId: parentId ?? undefined },
  });
  await writeAudit(req.user!.sub, 'UPDATE', 'Department', dept.id, existing, dept, req.ip);
  res.json(dept);
});

// --- Department heads ---

router.get('/department-heads', async (req, res) => {
  const { departmentId } = req.query;
  res.json(
    await prisma.departmentHead.findMany({
      where: { ...(departmentId ? { departmentId: String(departmentId) } : {}), isActive: true },
      orderBy: { name: 'asc' },
    })
  );
});

router.post('/department-heads', requireRole('ADMIN'), async (req, res) => {
  const { departmentId, name, userId } = req.body ?? {};
  if (!departmentId || !name?.trim()) {
    return res.status(400).json({ error: 'departmentId and name are required' });
  }
  const dept = await prisma.department.findUnique({ where: { id: String(departmentId) } });
  if (!dept) return res.status(404).json({ error: 'Department not found' });

  const existing = await prisma.departmentHead.findUnique({
    where: { departmentId_name: { departmentId: dept.id, name: name.trim() } },
  });
  if (existing) {
    if (existing.isActive) return res.status(409).json({ error: 'This head already exists for the department' });
    const revived = await prisma.departmentHead.update({ where: { id: existing.id }, data: { isActive: true } });
    return res.status(201).json(revived);
  }

  const head = await prisma.departmentHead.create({
    data: { departmentId: dept.id, name: name.trim(), userId: userId || null },
  });
  await writeAudit(req.user!.sub, 'CREATE', 'DepartmentHead', head.id, undefined, head, req.ip);
  res.status(201).json(head);
});

router.put('/department-heads/:id', requireRole('ADMIN'), async (req, res) => {
  const { name, isActive, userId } = req.body ?? {};
  const existing = await prisma.departmentHead.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'Department head not found' });

  const head = await prisma.departmentHead.update({
    where: { id: existing.id },
    data: {
      name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
      isActive: typeof isActive === 'boolean' ? isActive : undefined,
      userId: userId === null ? null : userId || undefined,
    },
  });
  await writeAudit(req.user!.sub, 'UPDATE', 'DepartmentHead', head.id, existing, head, req.ip);
  res.json(head);
});

router.get('/cost-centers', async (req, res) => {
  const { departmentId } = req.query;
  res.json(
    await prisma.costCenter.findMany({
      where: departmentId ? { departmentId: String(departmentId) } : undefined,
      orderBy: { name: 'asc' },
    })
  );
});

router.post('/cost-centers', requireRole('ADMIN'), async (req, res) => {
  const { name, departmentId } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const cc = await prisma.costCenter.create({ data: { name, departmentId: departmentId || null } });
  res.status(201).json(cc);
});

router.get('/categories', async (_req, res) => {
  res.json(await prisma.accountsCategory.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }));
});

router.post('/categories', requireRole('ADMIN'), async (req, res) => {
  const { code, label, budgetAmount } = req.body;
  if (!label) return res.status(400).json({ error: 'label is required' });
  if (budgetAmount != null && (typeof budgetAmount !== 'number' || budgetAmount < 0)) {
    return res.status(400).json({ error: 'budgetAmount must be a non-negative number' });
  }
  // Auto-generate a code when none is given (codes are internal now that the UI shows labels only).
  const finalCode = code?.trim() || `CAT-${Date.now().toString(36).toUpperCase()}`;
  const cat = await prisma.accountsCategory.create({
    data: { code: finalCode, label, budgetAmount: budgetAmount ?? 0 },
  });
  res.status(201).json(cat);
});

router.put('/categories/:id', requireRole('ADMIN'), async (req, res) => {
  const { code, label, isActive, budgetAmount } = req.body;
  if (budgetAmount != null && (typeof budgetAmount !== 'number' || budgetAmount < 0)) {
    return res.status(400).json({ error: 'budgetAmount must be a non-negative number' });
  }
  const cat = await prisma.accountsCategory.update({
    where: { id: String(req.params.id) },
    data: { code, label, isActive, budgetAmount: budgetAmount ?? undefined },
  });
  res.json(cat);
});

router.delete('/categories/:id', requireRole('ADMIN'), async (req, res) => {
  await prisma.accountsCategory.update({ where: { id: String(req.params.id) }, data: { isActive: false } });
  res.status(204).end();
});

router.get('/vendors', async (req, res) => {
  const { q } = req.query;
  res.json(
    await prisma.vendor.findMany({
      where: q ? { name: { contains: String(q), mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
    })
  );
});

router.post('/vendors', requireRole('ADMIN'), async (req, res) => {
  const parsed = vendorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const vendor = await prisma.vendor.create({ data: { ...parsed.data, email: parsed.data.email || null } });
  await writeAudit(req.user!.sub, 'CREATE', 'Vendor', vendor.id, undefined, vendor, req.ip);
  res.status(201).json(vendor);
});

router.put('/vendors/:id', requireRole('ADMIN'), async (req, res) => {
  const parsed = vendorSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = await prisma.vendor.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'Vendor not found' });
  const vendor = await prisma.vendor.update({
    where: { id: String(req.params.id) },
    data: { ...parsed.data, email: parsed.data.email === '' ? null : parsed.data.email },
  });
  await writeAudit(req.user!.sub, 'UPDATE', 'Vendor', vendor.id, existing, vendor, req.ip);
  res.json(vendor);
});

router.get('/financial-years', async (_req, res) => {
  res.json(await prisma.financialYear.findMany({ orderBy: { startDate: 'desc' } }));
});

router.post('/financial-years', requireRole('ADMIN'), async (req, res) => {
  const { label, startDate, endDate } = req.body;
  if (!label || !startDate || !endDate) {
    return res.status(400).json({ error: 'label, startDate and endDate are required' });
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return res.status(400).json({ error: 'startDate and endDate must be valid dates' });
  }
  if (end <= start) return res.status(400).json({ error: 'endDate must be after startDate' });

  const overlapping = await prisma.financialYear.findFirst({
    where: { startDate: { lte: end }, endDate: { gte: start } },
  });
  if (overlapping) {
    return res.status(409).json({ error: `Dates overlap with existing financial year ${overlapping.label}` });
  }

  const fy = await prisma.financialYear.create({ data: { label, startDate: start, endDate: end } });
  res.status(201).json(fy);
});

// User administration is admin-only.
router.get('/users', requireRole('ADMIN'), async (_req, res) => {
  res.json(
    await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        departmentId: true,
        managerId: true,
        isActive: true,
        headOf: { where: { isActive: true }, select: { id: true, name: true, departmentId: true } },
      },
      orderBy: { name: 'asc' },
    })
  );
});

// The app now uses three roles; MANAGER/ACCOUNTS remain in the DB enum for
// legacy rows but can't be assigned to new users.
const userCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
  role: z.enum(['ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE']).default('EMPLOYEE'),
  departmentId: z.string().uuid().optional().nullable(),
  // For DEPARTMENT_HEAD users: the existing head record to link them to.
  deptHeadId: z.string().uuid().optional().nullable(),
});

router.post('/users', requireRole('ADMIN'), async (req, res) => {
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { password, deptHeadId, ...data } = parsed.data;

  // Enforce a single admin account.
  if (data.role === 'ADMIN') {
    const adminExists = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } });
    if (adminExists) {
      return res.status(409).json({ error: 'An admin already exists. There can only be one admin.' });
    }
  }

  // Every non-admin user belongs to a department.
  if (data.role === 'EMPLOYEE' && !data.departmentId) {
    return res.status(400).json({ error: 'Employees must belong to a department' });
  }

  // Department heads must be linked to a head record in their department.
  let headToLink: { id: string } | null = null;
  if (data.role === 'DEPARTMENT_HEAD') {
    if (!data.departmentId) return res.status(400).json({ error: 'Department heads must belong to a department' });
    if (!deptHeadId) return res.status(400).json({ error: 'Select which department head this user is' });
    const head = await prisma.departmentHead.findUnique({ where: { id: deptHeadId } });
    if (!head || head.departmentId !== data.departmentId) {
      return res.status(400).json({ error: 'Selected head does not belong to the chosen department' });
    }
    if (head.userId) return res.status(409).json({ error: 'That head is already linked to a user' });
    headToLink = { id: head.id };
  }

  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) return res.status(409).json({ error: 'A user with this email already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { ...data, departmentId: data.departmentId || null, passwordHash },
    select: { id: true, name: true, email: true, role: true, departmentId: true, managerId: true, isActive: true },
  });
  if (headToLink) {
    await prisma.departmentHead.update({ where: { id: headToLink.id }, data: { userId: user.id } });
  }
  await writeAudit(req.user!.sub, 'CREATE', 'User', user.id, undefined, user, req.ip);
  res.status(201).json(user);
});

const userUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE']).optional(),
  departmentId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
});

router.put('/users/:id', requireRole('ADMIN'), async (req, res) => {
  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'User not found' });

  // Never leave the system without an active admin.
  const losingAdmin =
    existing.role === 'ADMIN' && (parsed.data.isActive === false || (parsed.data.role && parsed.data.role !== 'ADMIN'));
  if (losingAdmin) {
    const otherAdmins = await prisma.user.count({
      where: { role: 'ADMIN', isActive: true, id: { not: existing.id } },
    });
    if (otherAdmins === 0) {
      return res.status(400).json({ error: 'Cannot remove the only admin account' });
    }
  }

  const user = await prisma.user.update({
    where: { id: existing.id },
    data: parsed.data,
    select: { id: true, name: true, email: true, role: true, departmentId: true, managerId: true, isActive: true },
  });

  // Deactivating a user kills their sessions.
  if (parsed.data.isActive === false) {
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  await writeAudit(req.user!.sub, 'UPDATE', 'User', user.id, existing, user, req.ip);
  res.json(user);
});

router.post('/users/:id/reset-password', requireRole('ADMIN'), async (req, res) => {
  const { newPassword } = req.body ?? {};
  if (typeof newPassword !== 'string' || !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPassword)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters and include a letter and a number' });
  }

  const existing = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
  await prisma.refreshToken.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });

  await writeAudit(req.user!.sub, 'RESET_PASSWORD', 'User', existing.id, undefined, undefined, req.ip);
  res.json({ ok: true });
});

export default router;
