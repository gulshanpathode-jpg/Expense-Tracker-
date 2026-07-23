import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { ownerScope } from '../lib/scope';

const router = Router();
router.use(requireAuth);

router.get('/summary', async (req, res) => {
  const { fyId, departmentId, dateFrom, dateTo } = req.query;
  const user = req.user!;

  // Employees don't get a dashboard — they only see their own expenses.
  if (user.role === 'EMPLOYEE') {
    return res.status(403).json({ error: 'Dashboard is not available for your role' });
  }

  const isHead = user.role === 'DEPARTMENT_HEAD';
  const isOwner = user.role === 'OWNER';
  // Owners are scoped to their portfolio of heads, which may span departments,
  // so they key on a head-id set rather than a single department.
  const ownedHeadIds = isOwner ? (await ownerScope(user.sub)).headIds : null;
  const effectiveDeptId =
    isOwner
      ? undefined
      : isHead || user.role === 'MANAGER'
      ? user.departmentId ?? undefined
      : departmentId
      ? String(departmentId)
      : undefined;
  // Department heads are scoped to their own head-slice.
  const effectiveHeadId = isHead ? user.deptHeadId ?? undefined : undefined;

  // Drafts never count toward dashboard numbers.
  const expenseWhere: any = { status: 'SUBMITTED' };
  if (fyId) expenseWhere.fyId = String(fyId);
  if (effectiveDeptId) expenseWhere.departmentId = effectiveDeptId;
  if (effectiveHeadId) expenseWhere.deptHeadId = effectiveHeadId;
  if (ownedHeadIds) expenseWhere.deptHeadId = { in: ownedHeadIds };
  if (dateFrom || dateTo) {
    expenseWhere.invoiceDate = {};
    if (dateFrom) expenseWhere.invoiceDate.gte = new Date(String(dateFrom));
    if (dateTo) expenseWhere.invoiceDate.lte = new Date(String(dateTo));
  }

  const [budgets, headSpend, categorySpend, totals] = await Promise.all([
    prisma.budget.findMany({
      where: {
        fyId: fyId ? String(fyId) : undefined,
        departmentId: effectiveDeptId,
        ...(ownedHeadIds ? { deptHeadId: { in: ownedHeadIds } } : effectiveHeadId ? { deptHeadId: effectiveHeadId } : {}),
      },
      include: { department: true, deptHead: true },
    }),
    // Spend grouped per dept+head pair (head may be null).
    prisma.expense.groupBy({
      by: ['departmentId', 'deptHeadId'],
      where: expenseWhere,
      _sum: { amount: true },
      _count: true,
    }),
    prisma.expense.groupBy({
      by: ['categoryId'],
      where: expenseWhere,
      _sum: { amount: true },
      _count: true,
    }),
    prisma.expense.aggregate({ where: expenseWhere, _sum: { amount: true }, _count: true }),
  ]);

  // --- Department stats: aggregated per department, with a per-head breakdown ---
  const headKey = (deptId: string, headId: string | null) => `${deptId}::${headId ?? ''}`;
  const spendByHead = new Map(headSpend.map((h) => [headKey(h.departmentId, h.deptHeadId), { spent: h._sum.amount ?? 0, count: h._count }]));

  type HeadStat = { deptHeadId: string | null; name: string; allocated: number; spent: number; remaining: number; pct: number; count: number };
  type DeptAgg = { departmentId: string; name: string; allocated: number; spent: number; count: number; heads: Map<string, HeadStat> };
  const deptAgg = new Map<string, DeptAgg>();

  const ensureDept = (id: string, name: string): DeptAgg => {
    let d = deptAgg.get(id);
    if (!d) {
      d = { departmentId: id, name, allocated: 0, spent: 0, count: 0, heads: new Map() };
      deptAgg.set(id, d);
    }
    return d;
  };

  for (const b of budgets) {
    const d = ensureDept(b.departmentId, b.department.name);
    d.allocated += b.annualAmount;
    const s = spendByHead.get(headKey(b.departmentId, b.deptHeadId)) ?? { spent: 0, count: 0 };
    d.heads.set(b.deptHeadId ?? '', {
      deptHeadId: b.deptHeadId,
      name: b.deptHead?.name ?? 'Department (no head)',
      allocated: b.annualAmount,
      spent: s.spent,
      remaining: b.annualAmount - s.spent,
      pct: b.annualAmount > 0 ? (s.spent / b.annualAmount) * 100 : 0,
      count: s.count,
    });
    d.spent += s.spent;
    d.count += s.count;
  }

  // Spend rows without a matching budget line (unbudgeted dept or head).
  const orphaned = headSpend.filter((h) => !budgets.some((b) => b.departmentId === h.departmentId && (b.deptHeadId ?? null) === (h.deptHeadId ?? null)));
  if (orphaned.length > 0) {
    const [orphanDepts, orphanHeads] = await Promise.all([
      prisma.department.findMany({ where: { id: { in: [...new Set(orphaned.map((o) => o.departmentId))] } } }),
      prisma.departmentHead.findMany({ where: { id: { in: orphaned.map((o) => o.deptHeadId).filter((x): x is string => !!x) } } }),
    ]);
    for (const o of orphaned) {
      const deptName = orphanDepts.find((x) => x.id === o.departmentId)?.name ?? 'Unknown';
      const d = ensureDept(o.departmentId, deptName);
      const spent = o._sum.amount ?? 0;
      d.spent += spent;
      d.count += o._count;
      d.heads.set(o.deptHeadId ?? '', {
        deptHeadId: o.deptHeadId,
        name: o.deptHeadId ? orphanHeads.find((x) => x.id === o.deptHeadId)?.name ?? 'Unknown head' : 'Unassigned',
        allocated: 0,
        spent,
        remaining: -spent,
        pct: 0,
        count: o._count,
      });
    }
  }

  const departmentStats = [...deptAgg.values()]
    .map((d) => ({
      departmentId: d.departmentId,
      name: d.name,
      allocated: d.allocated,
      spent: d.spent,
      remaining: d.allocated - d.spent,
      pct: d.allocated > 0 ? (d.spent / d.allocated) * 100 : 0,
      count: d.count,
      heads: [...d.heads.values()].sort((a, b) => b.allocated - a.allocated),
    }))
    .sort((a, b) => b.allocated - a.allocated);

  // Categories: every active category appears with its configured budget.
  const categories = await prisma.accountsCategory.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
  const spendByCategory = new Map(categorySpend.map((c) => [c.categoryId, { spent: c._sum.amount ?? 0, count: c._count }]));
  const categoryStats = categories
    .map((c) => {
      const s = spendByCategory.get(c.id) ?? { spent: 0, count: 0 };
      return {
        categoryId: c.id,
        name: c.label,
        budget: c.budgetAmount,
        spent: s.spent,
        remaining: c.budgetAmount - s.spent,
        pct: c.budgetAmount > 0 ? (s.spent / c.budgetAmount) * 100 : 0,
        count: s.count,
      };
    })
    .filter((c) => c.budget > 0 || c.spent > 0)
    .sort((a, b) => b.budget - a.budget);

  // Monthly trend across the selected range (default: FY start-or-6-months-back to now).
  let trendStart: Date;
  let trendEnd: Date;
  const fy = fyId ? await prisma.financialYear.findUnique({ where: { id: String(fyId) } }) : null;
  if (dateFrom || dateTo) {
    trendEnd = dateTo ? new Date(String(dateTo)) : new Date();
    trendStart = dateFrom ? new Date(String(dateFrom)) : new Date(trendEnd.getFullYear(), trendEnd.getMonth() - 5, 1);
  } else if (fy) {
    trendStart = fy.startDate;
    trendEnd = new Date() < fy.endDate ? new Date() : fy.endDate;
  } else {
    trendEnd = new Date();
    trendStart = new Date(trendEnd.getFullYear(), trendEnd.getMonth() - 5, 1);
  }
  trendStart = new Date(trendStart.getFullYear(), trendStart.getMonth(), 1, 0, 0, 0, 0);
  const monthSpan = Math.min(
    36,
    Math.max(1, (trendEnd.getFullYear() - trendStart.getFullYear()) * 12 + (trendEnd.getMonth() - trendStart.getMonth()) + 1),
  );

  const { invoiceDate: _omitDate, ...trendWhereBase } = expenseWhere;
  const trendExpenses = await prisma.expense.findMany({
    where: { ...trendWhereBase, invoiceDate: { gte: trendStart, lte: trendEnd } },
    select: { amount: true, invoiceDate: true },
  });
  const monthlyTrendMap = new Map<string, number>();
  for (let i = 0; i < monthSpan; i++) {
    const d = new Date(trendStart.getFullYear(), trendStart.getMonth() + i, 1);
    monthlyTrendMap.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 0);
  }
  for (const e of trendExpenses) {
    const d = new Date(e.invoiceDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyTrendMap.has(key)) monthlyTrendMap.set(key, (monthlyTrendMap.get(key) ?? 0) + e.amount);
  }
  const monthlyTrend = [...monthlyTrendMap.entries()].map(([month, amount]) => ({ month, amount }));

  const now = new Date();
  const thisMonth = await prisma.expense.aggregate({
    where: { ...trendWhereBase, invoiceDate: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
    _sum: { amount: true },
  });

  const totalBudget = departmentStats.reduce((s, d) => s + d.allocated, 0);
  const totalSpent = totals._sum.amount ?? 0;

  res.json({
    totalBudget,
    totalSpent,
    totalRemaining: totalBudget - totalSpent,
    utilizationPct: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
    expenseCount: totals._count,
    avgExpense: totals._count > 0 ? totalSpent / totals._count : 0,
    monthlySpend: thisMonth._sum.amount ?? 0,
    departmentStats,
    categoryStats,
    monthlyTrend,
  });
});

export default router;
