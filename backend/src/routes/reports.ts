import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { sendExport, ReportColumn, ReportMeta } from '../lib/exporter';

const router = Router();
// Reporting is available to Admin (company-wide) and Department Heads (scoped to
// their own head-slice). Employees have no reports.
router.use(requireAuth, requireRole('ADMIN', 'DEPARTMENT_HEAD'));

async function periodBounds(period: string | undefined, from?: string, to?: string) {
  if (from || to) {
    return {
      gte: from ? new Date(from) : undefined,
      lte: to ? new Date(to) : undefined,
    };
  }
  const now = new Date();
  if (period === 'quarterly') {
    const q = Math.floor(now.getMonth() / 3);
    return { gte: new Date(now.getFullYear(), q * 3, 1), lte: now };
  }
  if (period === 'yearly') {
    // "Yearly" means the financial year (Apr–Mar), not the calendar year.
    const fy = await prisma.financialYear.findFirst({
      where: { startDate: { lte: now }, endDate: { gte: now } },
    });
    if (fy) return { gte: fy.startDate, lte: now };
    return { gte: new Date(now.getFullYear(), 0, 1), lte: now };
  }
  // monthly default
  return { gte: new Date(now.getFullYear(), now.getMonth(), 1), lte: now };
}

// Head-slice scope: department heads only ever report on their own slice.
// Admins may narrow department-based reports with optional departmentId /
// deptHeadId query filters (a head filter implies its department).
type Scope = { where: Record<string, unknown>; label: string };
async function scopeFor(
  user: { role: string; departmentId: string | null; deptHeadId?: string | null },
  adminFilter?: { departmentId?: string; deptHeadId?: string }
): Promise<Scope> {
  if (user.role !== 'DEPARTMENT_HEAD') {
    if (adminFilter?.deptHeadId) {
      const head = await prisma.departmentHead.findUnique({
        where: { id: adminFilter.deptHeadId },
        include: { department: true },
      });
      if (head) return { where: { deptHeadId: head.id }, label: `${head.department.name} — ${head.name}` };
    }
    if (adminFilter?.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: adminFilter.departmentId } });
      if (dept) return { where: { departmentId: dept.id }, label: dept.name };
    }
    return { where: {}, label: 'All departments' };
  }
  if (user.deptHeadId) {
    const head = await prisma.departmentHead.findUnique({
      where: { id: user.deptHeadId },
      include: { department: true },
    });
    return {
      where: { deptHeadId: user.deptHeadId },
      label: head ? `${head.department.name} — ${head.name}` : 'My head-slice',
    };
  }
  const dept = user.departmentId ? await prisma.department.findUnique({ where: { id: user.departmentId } }) : null;
  return { where: { departmentId: user.departmentId ?? '__none__' }, label: dept ? dept.name : 'My department' };
}

function periodLabel(period: string | undefined, from?: string, to?: string): string {
  if (from || to) return `Period: ${from ?? '…'} to ${to ?? '…'}`;
  if (period === 'quarterly') return 'Period: This quarter';
  if (period === 'yearly') return 'Period: This financial year';
  if (period === 'monthly') return 'Period: This month';
  return 'Period: All time';
}

// Department-wise expense report (a detailed expense register).
router.get('/department-wise', async (req, res) => {
  const { period, from, to, format, departmentId, deptHeadId } = req.query;
  const scope = await scopeFor(req.user!, {
    departmentId: departmentId ? String(departmentId) : undefined,
    deptHeadId: deptHeadId ? String(deptHeadId) : undefined,
  });
  const invoiceDate = await periodBounds(String(period ?? ''), from as string, to as string);

  const rows = await prisma.expense.findMany({
    where: { ...scope.where, invoiceDate, status: 'SUBMITTED' },
    include: { department: true, deptHead: true, category: true, vendor: true, user: { select: { name: true } } },
    orderBy: [{ department: { name: 'asc' } }, { invoiceDate: 'desc' }],
  });

  const data = rows.map((e) => ({
    date: e.invoiceDate.toISOString().slice(0, 10),
    department: e.department.name,
    departmentHead: e.deptHead?.name ?? '—',
    category: e.category.label,
    vendor: e.vendor?.name ?? '—',
    invoiceNo: e.invoiceNo ?? '—',
    submittedBy: e.user.name,
    amount: e.amount,
    gstAmount: e.gstAmount ?? 0,
  }));

  const columns: ReportColumn[] = [
    { header: 'Date', key: 'date', width: 12, type: 'date' },
    { header: 'Department', key: 'department', width: 24 },
    { header: 'Head', key: 'departmentHead', width: 16 },
    { header: 'Category', key: 'category', width: 26 },
    { header: 'Vendor', key: 'vendor', width: 22 },
    { header: 'Invoice No', key: 'invoiceNo', width: 14 },
    { header: 'Submitted By', key: 'submittedBy', width: 18 },
    { header: 'Amount', key: 'amount', width: 16, type: 'money' },
    { header: 'GST Amount', key: 'gstAmount', width: 14, type: 'money' },
  ];

  const meta: ReportMeta = {
    title: 'Department-wise Expense Report',
    subtitle: `${scope.label}   •   ${periodLabel(String(period ?? ''), from as string, to as string)}   •   ${rows.length} expense(s)`,
    totals: {
      amount: data.reduce((s, r) => s + r.amount, 0),
      gstAmount: data.reduce((s, r) => s + r.gstAmount, 0),
    },
  };

  await sendExport(res, format as string, 'department-wise-report', columns, data, meta);
});

// Budget utilization report: allocation vs recorded spend per budget line.
router.get('/budget-utilization', async (req, res) => {
  const { fyId, format, departmentId, deptHeadId } = req.query;
  const user = req.user!;
  // scope.where carries deptHeadId/departmentId keys, which exist on Budget too.
  const scope = await scopeFor(user, {
    departmentId: departmentId ? String(departmentId) : undefined,
    deptHeadId: deptHeadId ? String(deptHeadId) : undefined,
  });

  const budgets = await prisma.budget.findMany({
    where: { fyId: fyId ? String(fyId) : undefined, ...scope.where },
    include: { department: true, deptHead: true, financialYear: true },
    orderBy: { annualAmount: 'desc' },
  });

  const data = await Promise.all(
    budgets.map(async (b) => {
      const spent = await prisma.expense.aggregate({
        where: {
          departmentId: b.departmentId,
          fyId: b.fyId,
          status: 'SUBMITTED',
          ...(b.deptHeadId ? { deptHeadId: b.deptHeadId } : {}),
        },
        _sum: { amount: true },
        _count: true,
      });
      const utilized = spent._sum.amount ?? 0;
      return {
        department: b.department.name,
        head: b.deptHead?.name ?? '—',
        expenseCount: spent._count,
        allocated: b.annualAmount,
        utilized,
        remaining: b.annualAmount - utilized,
        utilizationPct: b.annualAmount > 0 ? Number(((utilized / b.annualAmount) * 100).toFixed(1)) : 0,
      };
    }),
  );

  const columns: ReportColumn[] = [
    { header: 'Department', key: 'department', width: 24 },
    { header: 'Head', key: 'head', width: 18 },
    { header: 'Expenses', key: 'expenseCount', width: 10, type: 'number' },
    { header: 'Allocated', key: 'allocated', width: 16, type: 'money' },
    { header: 'Utilized', key: 'utilized', width: 16, type: 'money' },
    { header: 'Remaining', key: 'remaining', width: 16, type: 'money' },
    { header: 'Utilization %', key: 'utilizationPct', width: 14, type: 'percent' },
  ];

  const totalAlloc = data.reduce((s, r) => s + r.allocated, 0);
  const totalUsed = data.reduce((s, r) => s + r.utilized, 0);
  const meta: ReportMeta = {
    title: 'Budget Utilization Report',
    subtitle: `${scope.label}   •   ${budgets.length} budget line(s)`,
    totals: {
      expenseCount: data.reduce((s, r) => s + r.expenseCount, 0),
      allocated: totalAlloc,
      utilized: totalUsed,
      remaining: totalAlloc - totalUsed,
      utilizationPct: totalAlloc > 0 ? Number(((totalUsed / totalAlloc) * 100).toFixed(1)) : 0,
    },
  };

  await sendExport(res, format as string, 'budget-utilization-report', columns, data, meta);
});

// Category budget vs spend report.
router.get('/category-wise', async (req, res) => {
  const { format } = req.query;
  const scope = await scopeFor(req.user!);
  const isHead = req.user!.role === 'DEPARTMENT_HEAD';

  const categories = await prisma.accountsCategory.findMany({
    where: { isActive: true },
    include: { expenses: { where: { status: 'SUBMITTED', ...scope.where } } },
    orderBy: { code: 'asc' },
  });

  const data = categories
    .map((c) => {
      const spent = c.expenses.reduce((s, e) => s + e.amount, 0);
      return {
        category: c.label,
        budget: c.budgetAmount,
        spent,
        remaining: c.budgetAmount - spent,
        share: 0, // filled after we know the grand total
        expenseCount: c.expenses.length,
      };
    })
    // For a head, only categories they actually spent on are meaningful.
    .filter((c) => (isHead ? c.spent > 0 : c.budget > 0 || c.spent > 0));

  const grandSpent = data.reduce((s, r) => s + r.spent, 0);
  data.forEach((r) => (r.share = grandSpent > 0 ? Number(((r.spent / grandSpent) * 100).toFixed(1)) : 0));

  // Company category budgets are org-wide; hide the budget columns for a head
  // (their spend against a company budget would be misleading).
  const columns: ReportColumn[] = isHead
    ? [
        { header: 'Category', key: 'category', width: 34 },
        { header: 'Spent', key: 'spent', width: 16, type: 'money' },
        { header: 'Share of My Spend %', key: 'share', width: 18, type: 'percent' },
        { header: 'Expenses', key: 'expenseCount', width: 10, type: 'number' },
      ]
    : [
        { header: 'Category', key: 'category', width: 34 },
        { header: 'Budget', key: 'budget', width: 16, type: 'money' },
        { header: 'Spent', key: 'spent', width: 16, type: 'money' },
        { header: 'Remaining', key: 'remaining', width: 16, type: 'money' },
        { header: 'Share of Spend %', key: 'share', width: 16, type: 'percent' },
        { header: 'Expenses', key: 'expenseCount', width: 10, type: 'number' },
      ];

  const meta: ReportMeta = {
    title: 'Category Budget Report',
    subtitle: `${scope.label}   •   ${data.length} category(ies)`,
    totals: isHead
      ? { spent: grandSpent, share: 100, expenseCount: data.reduce((s, r) => s + r.expenseCount, 0) }
      : {
          budget: data.reduce((s, r) => s + r.budget, 0),
          spent: grandSpent,
          remaining: data.reduce((s, r) => s + r.remaining, 0),
          share: 100,
          expenseCount: data.reduce((s, r) => s + r.expenseCount, 0),
        },
  };

  await sendExport(res, format as string, 'category-wise-report', columns, data, meta);
});

// Vendor spending report.
router.get('/vendor-spend', async (req, res) => {
  const { format } = req.query;
  const scope = await scopeFor(req.user!);

  const vendors = await prisma.vendor.findMany({
    include: { expenses: { where: { status: 'SUBMITTED', ...scope.where } } },
  });

  const data = vendors
    .map((v) => {
      const total = v.expenses.reduce((s, e) => s + e.amount, 0);
      return {
        vendor: v.name,
        gstNo: v.gstNo ?? '—',
        totalSpend: total,
        expenseCount: v.expenses.length,
        avgSpend: v.expenses.length ? Number((total / v.expenses.length).toFixed(2)) : 0,
        lastPaymentDate: v.expenses.length
          ? v.expenses
              .reduce((max, e) => (e.invoiceDate > max ? e.invoiceDate : max), v.expenses[0].invoiceDate)
              .toISOString()
              .slice(0, 10)
          : '',
      };
    })
    .filter((v) => v.expenseCount > 0)
    .sort((a, b) => b.totalSpend - a.totalSpend);

  const columns: ReportColumn[] = [
    { header: 'Vendor', key: 'vendor', width: 26 },
    { header: 'GST No', key: 'gstNo', width: 18 },
    { header: 'Total Spend', key: 'totalSpend', width: 16, type: 'money' },
    { header: 'Expenses', key: 'expenseCount', width: 10, type: 'number' },
    { header: 'Avg / Expense', key: 'avgSpend', width: 16, type: 'money' },
    { header: 'Last Payment', key: 'lastPaymentDate', width: 14, type: 'date' },
  ];

  const meta: ReportMeta = {
    title: 'Vendor Spending Report',
    subtitle: `${scope.label}   •   ${data.length} vendor(s)`,
    totals: {
      totalSpend: data.reduce((s, r) => s + r.totalSpend, 0),
      expenseCount: data.reduce((s, r) => s + r.expenseCount, 0),
    },
  };

  await sendExport(res, format as string, 'vendor-spend-report', columns, data, meta);
});

// Monthly/Quarterly/Yearly summary by department (admin) or by month (head).
router.get('/period-summary', async (req, res) => {
  const { period, from, to, format, departmentId, deptHeadId } = req.query;
  const scope = await scopeFor(req.user!, {
    departmentId: departmentId ? String(departmentId) : undefined,
    deptHeadId: deptHeadId ? String(deptHeadId) : undefined,
  });
  const invoiceDate = await periodBounds(String(period ?? 'monthly'), from as string, to as string);

  const rows = await prisma.expense.groupBy({
    by: ['departmentId'],
    where: { ...scope.where, invoiceDate, status: 'SUBMITTED' },
    _sum: { amount: true },
    _count: true,
    orderBy: { _sum: { amount: 'desc' } },
  });
  const depts = await prisma.department.findMany({ where: { id: { in: rows.map((r) => r.departmentId) } } });
  const grand = rows.reduce((s, r) => s + (r._sum.amount ?? 0), 0);

  const data = rows.map((r) => {
    const dept = depts.find((d) => d.id === r.departmentId);
    const spend = r._sum.amount ?? 0;
    return {
      department: dept?.name ?? 'Unknown',
      totalSpend: spend,
      expenseCount: r._count,
      share: grand > 0 ? Number(((spend / grand) * 100).toFixed(1)) : 0,
    };
  });

  const columns: ReportColumn[] = [
    { header: 'Department', key: 'department', width: 28 },
    { header: 'Total Spend', key: 'totalSpend', width: 16, type: 'money' },
    { header: 'Expenses', key: 'expenseCount', width: 10, type: 'number' },
    { header: 'Share %', key: 'share', width: 12, type: 'percent' },
  ];

  const meta: ReportMeta = {
    title: 'Period Summary Report',
    subtitle: `${scope.label}   •   ${periodLabel(String(period ?? 'monthly'), from as string, to as string)}`,
    totals: {
      totalSpend: grand,
      expenseCount: data.reduce((s, r) => s + r.expenseCount, 0),
      share: data.length ? 100 : 0,
    },
  };

  await sendExport(res, format as string, `${period ?? 'monthly'}-summary-report`, columns, data, meta);
});

// Monthly breakdown of spend (rows = months) — most useful for a single head.
router.get('/monthly-breakdown', async (req, res) => {
  const { fyId, format } = req.query;
  const scope = await scopeFor(req.user!);

  const fy = fyId
    ? await prisma.financialYear.findUnique({ where: { id: String(fyId) } })
    : await prisma.financialYear.findFirst({ where: { isActive: true }, orderBy: { startDate: 'desc' } });

  const where: Record<string, unknown> = { ...scope.where, status: 'SUBMITTED' };
  if (fy) where.invoiceDate = { gte: fy.startDate, lte: fy.endDate };

  const expenses = await prisma.expense.findMany({
    where,
    select: { amount: true, gstAmount: true, invoiceDate: true },
  });

  const byMonth = new Map<string, { spend: number; gst: number; count: number }>();
  for (const e of expenses) {
    const d = new Date(e.invoiceDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const cur = byMonth.get(key) ?? { spend: 0, gst: 0, count: 0 };
    cur.spend += e.amount;
    cur.gst += e.gstAmount ?? 0;
    cur.count += 1;
    byMonth.set(key, cur);
  }

  const data = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => {
      const [y, m] = month.split('-').map(Number);
      return {
        month: new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
        totalSpend: v.spend,
        gstAmount: Number(v.gst.toFixed(2)),
        expenseCount: v.count,
      };
    });

  const columns: ReportColumn[] = [
    { header: 'Month', key: 'month', width: 16 },
    { header: 'Total Spend', key: 'totalSpend', width: 16, type: 'money' },
    { header: 'GST Amount', key: 'gstAmount', width: 14, type: 'money' },
    { header: 'Expenses', key: 'expenseCount', width: 10, type: 'number' },
  ];

  const meta: ReportMeta = {
    title: 'Monthly Spend Breakdown',
    subtitle: `${scope.label}   •   ${fy ? fy.label : 'All time'}`,
    totals: {
      totalSpend: data.reduce((s, r) => s + r.totalSpend, 0),
      gstAmount: Number(data.reduce((s, r) => s + r.gstAmount, 0).toFixed(2)),
      expenseCount: data.reduce((s, r) => s + r.expenseCount, 0),
    },
  };

  await sendExport(res, format as string, 'monthly-breakdown-report', columns, data, meta);
});

export default router;
