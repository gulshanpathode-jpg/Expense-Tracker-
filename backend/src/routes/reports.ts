import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { sendExport } from '../lib/exporter';

const router = Router();
// Company-wide reporting is for Admin and Accounts only (matches the frontend nav).
router.use(requireAuth, requireRole('ADMIN', 'ACCOUNTS'));

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

// Department-wise expense report
router.get('/department-wise', async (req, res) => {
  const { period, from, to, format } = req.query;
  const invoiceDate = await periodBounds(String(period ?? ''), from as string, to as string);

  const rows = await prisma.expense.findMany({
    where: { invoiceDate, status: 'SUBMITTED' },
    include: { department: true, deptHead: true, category: true, vendor: true, user: { select: { name: true } } },
    orderBy: { invoiceDate: 'desc' },
  });

  const data = rows.map((e) => ({
    date: e.invoiceDate.toISOString().slice(0, 10),
    department: e.department.code ? `${e.department.code} - ${e.department.name}` : e.department.name,
    departmentHead: e.deptHead?.name ?? '',
    category: e.category.label,
    vendor: e.vendor?.name ?? '',
    submittedBy: e.user.name,
    currency: e.currency,
    amount: e.amount,
    gstAmount: e.gstAmount ?? 0,
  }));

  await sendExport(
    res,
    format as string,
    'department-wise-report',
    [
      { header: 'Date', key: 'date' },
      { header: 'Department', key: 'department', width: 30 },
      { header: 'Department Head', key: 'departmentHead', width: 20 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Vendor', key: 'vendor', width: 24 },
      { header: 'Submitted By', key: 'submittedBy', width: 20 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Amount', key: 'amount' },
      { header: 'GST Amount', key: 'gstAmount' },
    ],
    data,
  );
});

// Budget utilization report: department allocation vs recorded spend.
router.get('/budget-utilization', async (req, res) => {
  const { fyId, format } = req.query;
  const budgets = await prisma.budget.findMany({
    where: { fyId: fyId ? String(fyId) : undefined },
    include: { department: true, deptHead: true },
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
      });
      const utilized = spent._sum.amount ?? 0;
      return {
        department: b.deptHead ? `${b.department.name} – ${b.deptHead.name}` : b.department.name,
        allocated: b.annualAmount,
        utilized,
        remaining: b.annualAmount - utilized,
        utilizationPct: b.annualAmount > 0 ? Number(((utilized / b.annualAmount) * 100).toFixed(1)) : 0,
      };
    }),
  );

  await sendExport(
    res,
    format as string,
    'budget-utilization-report',
    [
      { header: 'Department', key: 'department', width: 30 },
      { header: 'Allocated', key: 'allocated' },
      { header: 'Utilized', key: 'utilized' },
      { header: 'Remaining', key: 'remaining' },
      { header: 'Utilization %', key: 'utilizationPct' },
    ],
    data,
  );
});

// Category budget vs spend report.
router.get('/category-wise', async (req, res) => {
  const { format } = req.query;
  const categories = await prisma.accountsCategory.findMany({
    where: { isActive: true },
    include: { expenses: { where: { status: 'SUBMITTED' } } },
    orderBy: { code: 'asc' },
  });

  const data = categories.map((c) => {
    const spent = c.expenses.reduce((s, e) => s + e.amount, 0);
    return {
      category: c.label,
      budget: c.budgetAmount,
      spent,
      remaining: c.budgetAmount - spent,
      expenseCount: c.expenses.length,
    };
  });

  await sendExport(
    res,
    format as string,
    'category-wise-report',
    [
      { header: 'Category', key: 'category', width: 40 },
      { header: 'Budget', key: 'budget' },
      { header: 'Spent', key: 'spent' },
      { header: 'Remaining', key: 'remaining' },
      { header: 'Expense Count', key: 'expenseCount' },
    ],
    data,
  );
});

// Vendor spending report
router.get('/vendor-spend', async (req, res) => {
  const { format } = req.query;
  const vendors = await prisma.vendor.findMany({
    include: { expenses: { where: { status: 'SUBMITTED' } } },
  });

  const data = vendors
    .map((v) => ({
      vendor: v.name,
      gstNo: v.gstNo ?? '',
      totalSpend: v.expenses.reduce((s, e) => s + e.amount, 0),
      expenseCount: v.expenses.length,
      lastPaymentDate: v.expenses.length
        ? v.expenses.reduce((max, e) => (e.invoiceDate > max ? e.invoiceDate : max), v.expenses[0].invoiceDate).toISOString().slice(0, 10)
        : '',
    }))
    .filter((v) => v.expenseCount > 0)
    .sort((a, b) => b.totalSpend - a.totalSpend);

  await sendExport(
    res,
    format as string,
    'vendor-spend-report',
    [
      { header: 'Vendor', key: 'vendor', width: 28 },
      { header: 'GST No', key: 'gstNo', width: 18 },
      { header: 'Total Spend', key: 'totalSpend' },
      { header: 'Expense Count', key: 'expenseCount' },
      { header: 'Last Payment Date', key: 'lastPaymentDate' },
    ],
    data,
  );
});

// GST report
router.get('/gst', async (req, res) => {
  const { period, from, to, format } = req.query;
  const invoiceDate = await periodBounds(String(period ?? ''), from as string, to as string);

  const rows = await prisma.expense.findMany({
    where: { invoiceDate, gstAmount: { not: null }, status: 'SUBMITTED' },
    include: { vendor: true, department: true },
    orderBy: { invoiceDate: 'desc' },
  });

  const data = rows.map((e) => ({
    date: e.invoiceDate.toISOString().slice(0, 10),
    invoiceNo: e.invoiceNo ?? '',
    vendor: e.vendor?.name ?? '',
    vendorGstNo: e.vendor?.gstNo ?? '',
    department: e.department.name,
    currency: e.currency,
    amount: e.amount,
    gstAmount: e.gstAmount ?? 0,
  }));

  await sendExport(
    res,
    format as string,
    'gst-report',
    [
      { header: 'Date', key: 'date' },
      { header: 'Invoice No', key: 'invoiceNo', width: 18 },
      { header: 'Vendor', key: 'vendor', width: 24 },
      { header: 'Vendor GST No', key: 'vendorGstNo', width: 20 },
      { header: 'Department', key: 'department', width: 24 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Amount', key: 'amount' },
      { header: 'GST Amount', key: 'gstAmount' },
    ],
    data,
  );
});

// Monthly/Quarterly/Yearly summary report
router.get('/period-summary', async (req, res) => {
  const { period, from, to, format } = req.query;
  const invoiceDate = await periodBounds(String(period ?? 'monthly'), from as string, to as string);

  const rows = await prisma.expense.groupBy({
    by: ['departmentId'],
    where: { invoiceDate, status: 'SUBMITTED' },
    _sum: { amount: true },
    _count: true,
    orderBy: { _sum: { amount: 'desc' } },
  });
  const depts = await prisma.department.findMany({ where: { id: { in: rows.map((r) => r.departmentId) } } });

  const data = rows.map((r) => {
    const dept = depts.find((d) => d.id === r.departmentId);
    return {
      department: dept ? (dept.code ? `${dept.code} - ${dept.name}` : dept.name) : 'Unknown',
      totalSpend: r._sum.amount ?? 0,
      expenseCount: r._count,
    };
  });

  await sendExport(
    res,
    format as string,
    `${period ?? 'monthly'}-summary-report`,
    [
      { header: 'Department', key: 'department', width: 30 },
      { header: 'Total Spend', key: 'totalSpend' },
      { header: 'Expense Count', key: 'expenseCount' },
    ],
    data,
  );
});

export default router;
