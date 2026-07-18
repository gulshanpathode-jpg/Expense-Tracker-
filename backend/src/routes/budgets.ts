import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { writeAudit } from '../lib/audit';
import { notify } from '../lib/notify';

const router = Router();
router.use(requireAuth);

function evenMonthlySplit(annual: number): number[] {
  const base = Math.floor((annual / 12) * 100) / 100;
  const amounts = new Array(12).fill(base);
  const remainder = Math.round((annual - base * 12) * 100) / 100;
  amounts[11] = Math.round((amounts[11] + remainder) * 100) / 100;
  return amounts;
}

function isCompanyWideRole(role: string): boolean {
  return role === 'ADMIN' || role === 'ACCOUNTS';
}

// Attaches spent/remaining figures (from recorded expenses) to a budget row.
// Head-scoped budgets only count that head's spend; drafts never count.
async function withUtilization<T extends { departmentId: string; deptHeadId: string | null; fyId: string; annualAmount: number }>(budget: T) {
  const spent = await prisma.expense.aggregate({
    where: {
      departmentId: budget.departmentId,
      fyId: budget.fyId,
      status: 'SUBMITTED',
      ...(budget.deptHeadId ? { deptHeadId: budget.deptHeadId } : {}),
    },
    _sum: { amount: true },
    _count: true,
  });
  const totalUtilized = spent._sum.amount ?? 0;
  return {
    ...budget,
    totalUtilized,
    expenseCount: spent._count,
    totalRemaining: budget.annualAmount - totalUtilized,
    utilizationPct: budget.annualAmount > 0 ? (totalUtilized / budget.annualAmount) * 100 : 0,
  };
}

router.get('/', async (req, res) => {
  const { departmentId, fyId } = req.query;
  const user = req.user!;

  // Non-admin/accounts users only see their own department's budgets, and
  // department heads only their own head-slice.
  const effectiveDeptId = isCompanyWideRole(user.role)
    ? departmentId
      ? String(departmentId)
      : undefined
    : user.departmentId ?? '__none__';
  const headFilter =
    user.role === 'DEPARTMENT_HEAD' && user.deptHeadId ? { deptHeadId: user.deptHeadId } : {};

  const budgets = await prisma.budget.findMany({
    where: {
      departmentId: effectiveDeptId,
      fyId: fyId ? String(fyId) : undefined,
      ...headFilter,
    },
    include: { department: true, deptHead: true, financialYear: true },
    orderBy: { annualAmount: 'desc' },
  });
  res.json(await Promise.all(budgets.map(withUtilization)));
});

router.get('/:id/summary', async (req, res) => {
  const budget = await prisma.budget.findUnique({
    where: { id: String(req.params.id) },
    include: { department: true, deptHead: true, financialYear: true },
  });
  if (!budget) return res.status(404).json({ error: 'Budget not found' });
  if (!isCompanyWideRole(req.user!.role) && budget.departmentId !== req.user!.departmentId) {
    return res.status(403).json({ error: 'You do not have access to this budget' });
  }
  res.json(await withUtilization(budget));
});

// Create or update a budget for a FY, per department + optional head. Splits
// the annual amount evenly across 12 months unless explicit monthly amounts
// are given.
router.post('/', requireRole('ADMIN'), async (req, res) => {
  const { departmentId, deptHeadId, fyId, annualAmount, monthlyAmounts } = req.body;
  if (!departmentId || !fyId || typeof annualAmount !== 'number' || annualAmount <= 0) {
    return res.status(400).json({ error: 'departmentId, fyId and a positive annualAmount are required' });
  }

  const headId = deptHeadId || null;
  if (headId) {
    const head = await prisma.departmentHead.findUnique({ where: { id: String(headId) } });
    if (!head || head.departmentId !== departmentId) {
      return res.status(400).json({ error: 'deptHeadId does not belong to the given department' });
    }
  }

  const months = Array.isArray(monthlyAmounts) && monthlyAmounts.length === 12
    ? monthlyAmounts
    : evenMonthlySplit(annualAmount);

  // deptHeadId is nullable, so the compound unique can't be used with upsert —
  // find-then-write keeps "one budget per dept(+head) per FY" for the null case.
  const existing = await prisma.budget.findFirst({ where: { departmentId, deptHeadId: headId, fyId } });
  const budget = existing
    ? await prisma.budget.update({
        where: { id: existing.id },
        data: { annualAmount, monthlyAmounts: months },
        include: { department: true, deptHead: true, financialYear: true },
      })
    : await prisma.budget.create({
        data: { departmentId, deptHeadId: headId, fyId, annualAmount, monthlyAmounts: months },
        include: { department: true, deptHead: true, financialYear: true },
      });

  await writeAudit(req.user!.sub, 'UPSERT', 'Budget', budget.id, undefined, budget, req.ip);
  res.status(201).json(await withUtilization(budget));
});

router.post('/:id/revise', requireRole('ADMIN', 'DEPARTMENT_HEAD'), async (req, res) => {
  const { newAmount, reason } = req.body;
  if (typeof newAmount !== 'number' || newAmount <= 0 || !reason) {
    return res.status(400).json({ error: 'a positive newAmount and reason are required' });
  }

  const budget = await prisma.budget.findUnique({ where: { id: String(req.params.id) }, include: { revisions: true } });
  if (!budget) return res.status(404).json({ error: 'Budget not found' });
  if (req.user!.role === 'DEPARTMENT_HEAD' && budget.departmentId !== req.user!.departmentId) {
    return res.status(403).json({ error: 'You can only revise your own department\'s budget' });
  }

  const version = budget.revisions.length + 1;
  const oldAmount = budget.annualAmount;

  const revision = await prisma.$transaction(async (tx) => {
    await tx.budget.update({
      where: { id: budget.id },
      data: { annualAmount: newAmount, monthlyAmounts: evenMonthlySplit(newAmount) },
    });

    return tx.budgetRevision.create({
      data: { budgetId: budget.id, version, oldAmount, newAmount, reason, revisedBy: req.user!.sub },
    });
  });

  await writeAudit(req.user!.sub, 'REVISE', 'Budget', budget.id, { annualAmount: oldAmount }, { annualAmount: newAmount, reason }, req.ip);

  const deptHead = await prisma.user.findFirst({ where: { departmentId: budget.departmentId, role: 'DEPARTMENT_HEAD', isActive: true } });
  if (deptHead) {
    await notify(deptHead.id, 'BUDGET_REVISION', `Budget revised from ${oldAmount} to ${newAmount}. Reason: ${reason}`, `/`);
  }

  res.status(201).json(revision);
});

router.get('/:id/revisions', async (req, res) => {
  const budget = await prisma.budget.findUnique({ where: { id: String(req.params.id) } });
  if (!budget) return res.status(404).json({ error: 'Budget not found' });
  if (!isCompanyWideRole(req.user!.role) && budget.departmentId !== req.user!.departmentId) {
    return res.status(403).json({ error: 'You do not have access to this budget' });
  }
  res.json(
    await prisma.budgetRevision.findMany({ where: { budgetId: String(req.params.id) }, orderBy: { version: 'desc' } })
  );
});

export default router;
