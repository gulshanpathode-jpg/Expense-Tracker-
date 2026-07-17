import { prisma } from './prisma';
import { money } from '../utils/format';

export type NotificationType =
  | 'EXPENSE_RECORDED'
  | 'PR_APPROVAL'
  | 'PO_APPROVAL'
  | 'BUDGET_REVISION'
  | 'BUDGET_ALERT';

export async function notify(userId: string, type: NotificationType, message: string, link?: string) {
  return prisma.notification.create({ data: { userId, type, message, link } });
}

export async function notifyMany(userIds: string[], type: NotificationType, message: string, link?: string) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  await prisma.notification.createMany({ data: unique.map((userId) => ({ userId, type, message, link })) });
}

const BUDGET_THRESHOLDS = [50, 75, 90, 100] as const;

// Checks a department's FY spend against 50/75/90/100% of its annual budget and
// notifies the department head + admins the first time a threshold is crossed.
// Callers pass the pre-change spend so we only fire once per threshold crossing.
export async function checkDepartmentBudgetThreshold(departmentId: string, fyId: string, previousSpent: number) {
  // Budgets are per dept-head; the department's allocation is the sum of them.
  const budgets = await prisma.budget.findMany({
    where: { departmentId, fyId },
    include: { department: true },
  });
  const annualAmount = budgets.reduce((s, b) => s + b.annualAmount, 0);
  if (budgets.length === 0 || annualAmount <= 0) return;

  const spent = await prisma.expense.aggregate({
    where: { departmentId, fyId, status: 'SUBMITTED' },
    _sum: { amount: true },
  });
  const currentSpent = spent._sum.amount ?? 0;

  const prevPct = (previousSpent / annualAmount) * 100;
  const newPct = (currentSpent / annualAmount) * 100;

  const crossed = BUDGET_THRESHOLDS.filter((t) => prevPct < t && newPct >= t);
  if (crossed.length === 0) return;

  const topThreshold = crossed[crossed.length - 1];
  const label = topThreshold >= 100 ? 'Budget exceeded' : `${topThreshold}% budget utilized`;
  const message = `${label}: ${budgets[0].department.name} is at ${newPct.toFixed(0)}% of ${money(annualAmount)}.`;

  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [{ role: 'ADMIN' }, { role: 'DEPARTMENT_HEAD', departmentId }],
    },
    select: { id: true },
  });

  await notifyMany(recipients.map((r) => r.id), 'BUDGET_ALERT', message, `/`);
}
