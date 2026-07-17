import cron from 'node-cron';
import { prisma } from './prisma';
import { notify } from './notify';

function evenMonthlySplit(annual: number): number[] {
  const base = Math.floor((annual / 12) * 100) / 100;
  const amounts = new Array(12).fill(base);
  const remainder = Math.round((annual - base * 12) * 100) / 100;
  amounts[11] = Math.round((amounts[11] + remainder) * 100) / 100;
  return amounts;
}

// Runs daily at 02:00. When today falls inside a financial year that has just
// started (within its first 3 days), auto-creates each department's Budget row
// for that new FY by carrying forward last year's annual amount. Idempotent:
// skips departments that already have a budget for the new FY.
async function monthlyBudgetRollover() {
  const now = new Date();
  const newFy = await prisma.financialYear.findFirst({
    where: { isActive: true, startDate: { lte: now, gte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) } },
  });
  if (!newFy) return;

  const priorFy = await prisma.financialYear.findFirst({
    where: { endDate: { lt: newFy.startDate } },
    orderBy: { endDate: 'desc' },
  });
  if (!priorFy) return;

  const priorBudgets = await prisma.budget.findMany({ where: { fyId: priorFy.id } });

  for (const prior of priorBudgets) {
    const alreadyRolled = await prisma.budget.findFirst({
      where: { departmentId: prior.departmentId, deptHeadId: prior.deptHeadId, fyId: newFy.id },
    });
    if (alreadyRolled) continue;

    await prisma.budget.create({
      data: {
        departmentId: prior.departmentId,
        deptHeadId: prior.deptHeadId,
        fyId: newFy.id,
        annualAmount: prior.annualAmount,
        monthlyAmounts: evenMonthlySplit(prior.annualAmount),
      },
    });
    console.log(`[automation] Rolled over budget for department ${prior.departmentId} into FY ${newFy.label}`);
  }
}

// Runs daily at 09:15. Sweeps department budgets and notifies when spend is at
// 90%+ of the annual amount (covers crossings missed by the inline check).
async function budgetThresholdSweep() {
  const budgets = await prisma.budget.findMany({ include: { department: true, deptHead: true } });

  for (const budget of budgets) {
    if (budget.annualAmount <= 0) continue;

    // Head-scoped budgets sweep that head's spend only; drafts never count.
    const spent = await prisma.expense.aggregate({
      where: {
        departmentId: budget.departmentId,
        fyId: budget.fyId,
        status: 'SUBMITTED',
        ...(budget.deptHeadId ? { deptHeadId: budget.deptHeadId } : {}),
      },
      _sum: { amount: true },
    });
    const pct = ((spent._sum.amount ?? 0) / budget.annualAmount) * 100;
    if (pct < 90) continue;

    const budgetName = budget.deptHead ? `${budget.department.name} – ${budget.deptHead.name}` : budget.department.name;
    const label = pct >= 100 ? 'Budget exceeded' : '90% budget utilized';
    const message = `${label}: ${budgetName} is at ${pct.toFixed(0)}% of its annual budget.`;

    // Dedupe on the department + threshold label so a percentage moving from
    // 91% to 92% doesn't re-alert every day.
    const recentAlert = await prisma.notification.findFirst({
      where: {
        type: 'BUDGET_ALERT',
        message: { startsWith: `${label}: ${budgetName}` },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (recentAlert) continue;

    const recipients = await prisma.user.findMany({
      where: { isActive: true, OR: [{ role: 'ADMIN' }, { role: 'DEPARTMENT_HEAD', departmentId: budget.departmentId }] },
      select: { id: true },
    });
    for (const r of recipients) {
      await notify(r.id, 'BUDGET_ALERT', message, `/`);
    }
  }
}

// Runs daily at 03:00. Prunes old notifications and expired/revoked refresh
// tokens so those tables don't grow without bound.
async function storageCleanup() {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const { count: notifCount } = await prisma.notification.deleteMany({
    where: { isRead: true, createdAt: { lt: ninetyDaysAgo } },
  });
  const { count: tokenCount } = await prisma.refreshToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] },
  });
  if (notifCount > 0 || tokenCount > 0) {
    console.log(`[automation] Cleanup: removed ${notifCount} read notification(s), ${tokenCount} stale refresh token(s)`);
  }
}

export function startAutomationJobs() {
  cron.schedule('0 2 * * *', () => monthlyBudgetRollover().catch((e) => console.error('[automation] rollover failed', e)));
  cron.schedule('0 3 * * *', () => storageCleanup().catch((e) => console.error('[automation] cleanup failed', e)));
  cron.schedule('15 9 * * *', () => budgetThresholdSweep().catch((e) => console.error('[automation] threshold sweep failed', e)));
  console.log('[automation] Scheduled jobs registered: monthly rollover (02:00), storage cleanup (03:00), budget threshold sweep (09:15)');
}
