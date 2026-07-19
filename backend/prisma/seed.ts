import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Departments, heads, and annual budgets from "Engage 360 data.xlsx".
// Every department has at least one head, and every head is a login user.
// Emails are the real dhaninfo.biz mailboxes. Budgets are per department-head.
const DEPARTMENTS: { name: string; heads: { name: string; email: string; budget: number }[] }[] = [
  {
    name: 'Operations',
    heads: [
      { name: 'Rakesh', email: 'rakesh@dhaninfo.biz', budget: 375691.94 },
      { name: 'Vikas', email: 'vikas.jain@dhaninfo.biz', budget: 458243.08 },
      { name: 'Solomon', email: 'solomon.david@dhaninfo.biz', budget: 148255.11 },
      { name: 'Ruchita', email: 'rnagmote@dhaninfo.biz', budget: 163417.57 },
      { name: 'Himanshu', email: 'himanshu.bajaj@dhaninfo.biz', budget: 23586.04 },
      { name: 'Ritesh', email: 'ritesh.labde@dhaninfo.biz', budget: 126353.79 },
    ],
  },
  { name: 'Information Technology', heads: [{ name: 'Satish', email: 'satish@dhaninfo.biz', budget: 21901.32 }] },
  { name: 'Human Resource', heads: [{ name: 'Abhijeet', email: 'abhijeet.dhawale@dhaninfo.biz', budget: 25270.76 }] },
  { name: 'Administration', heads: [{ name: 'Prashik', email: 'prashik.ingle@dhaninfo.biz', budget: 18531.89 }] },
  { name: 'Artificial Intelligence', heads: [{ name: 'Kanchan', email: 'kanchan.borade@dhaninfo.biz', budget: 8423.59 }] },
  { name: 'Accounts & Finance', heads: [{ name: 'Accounts Head', email: 'accounts@dhaninfo.biz', budget: 5054.15 }] },
  { name: 'Sales & Marketing', heads: [{ name: 'Rohan', email: 'sales@dhaninfo.biz', budget: 26955.48 }] },
];

// Categories and their annual budgets from the "Objectives" table in the Excel.
const CATEGORIES: { code: string; label: string; budgetAmount: number }[] = [
  { code: 'E00', label: 'Objectives', budgetAmount: 0 },
  { code: 'E01', label: 'Leadership Summit', budgetAmount: 150000 },
  { code: 'E02', label: 'Leadership Discretionary Fund', budgetAmount: 1400000 },
  { code: 'E03', label: 'Rewards & Recognition', budgetAmount: 400000 },
  { code: 'E04', label: 'Wellness & Wellbeing', budgetAmount: 150000 },
  { code: 'E05', label: 'Festival Celebrations', budgetAmount: 500000 },
  { code: 'E06', label: 'Employee Clubs & Interest Groups', budgetAmount: 250000 },
  { code: 'E07', label: 'Employee Appreciation & Family Connect', budgetAmount: 100000 },
  { code: 'E08', label: 'Fun @ Work & Engagement Activities (welcome Kits)', budgetAmount: 400000 },
  { code: 'E09', label: 'Learning & Career Engagement', budgetAmount: 200000 },
  { code: 'E10', label: 'Innovation & Special Projects Fund', budgetAmount: 100000 },
];

function evenMonthlySplit(annual: number): number[] {
  const base = Math.floor((annual / 12) * 100) / 100;
  const amounts = new Array(12).fill(base);
  const remainder = Math.round((annual - base * 12) * 100) / 100;
  amounts[11] = Math.round((amounts[11] + remainder) * 100) / 100;
  return amounts;
}

const DEFAULT_PASSWORD = 'Dhaninfo@2026';

async function main() {
  // Reset transactional data on every seed so we start from a clean slate.
  console.log('Clearing transactional data...');
  await prisma.expenseAttachment.deleteMany();
  await prisma.purchaseOrderDelivery.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.purchaseRequestItem.deleteMany();
  await prisma.purchaseRequest.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.budgetRevision.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.passwordResetCode.deleteMany();
  await prisma.auditLog.deleteMany();

  console.log('Seeding financial year...');
  const fy = await prisma.financialYear.upsert({
    where: { label: 'FY2026-27' },
    update: {},
    create: { label: 'FY2026-27', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31') },
  });

  console.log('Seeding categories...');
  for (const cat of CATEGORIES) {
    await prisma.accountsCategory.upsert({
      where: { code: cat.code },
      update: { label: cat.label, budgetAmount: cat.budgetAmount, isActive: true },
      create: cat,
    });
  }
  await prisma.accountsCategory.updateMany({
    where: { code: { notIn: CATEGORIES.map((c) => c.code) } },
    data: { isActive: false },
  });

  console.log('Seeding departments, heads, head-users, and budgets...');
  // Deactivate any departments no longer in the config (detach their users first).
  const currentNames = DEPARTMENTS.map((d) => d.name);
  const legacyDepts = await prisma.department.findMany({ where: { name: { notIn: currentNames } } });
  if (legacyDepts.length > 0) {
    const legacyIds = legacyDepts.map((d) => d.id);
    await prisma.user.updateMany({
      where: { departmentId: { in: legacyIds } },
      data: { departmentId: null },
    });
    // Retire heads of removed departments too (and their login users), so
    // every environment converges to the same active-head set.
    const legacyHeads = await prisma.departmentHead.findMany({
      where: { departmentId: { in: legacyIds }, isActive: true },
    });
    for (const lh of legacyHeads) {
      await prisma.departmentHead.update({ where: { id: lh.id }, data: { isActive: false } });
      if (lh.userId) await prisma.user.update({ where: { id: lh.userId }, data: { isActive: false, departmentId: null } });
    }
    await prisma.department.updateMany({
      where: { id: { in: legacyIds } },
      data: { isActive: false },
    });
  }

  const password = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // Single admin account.
  await prisma.user.upsert({
    where: { email: 'admin@dhaninfo.biz' },
    update: { role: 'ADMIN', isActive: true },
    create: { name: 'admin', email: 'admin@dhaninfo.biz', passwordHash: password, role: 'ADMIN' },
  });

  // Retire any old *.exptrack.local demo accounts from earlier seeds.
  await prisma.user.updateMany({
    where: { email: { endsWith: '@exptrack.local' } },
    data: { isActive: false, departmentId: null },
  });

  const deptIds = new Map<string, string>();

  for (const d of DEPARTMENTS) {
    const dept = await prisma.department.upsert({
      where: { name: d.name },
      update: { isActive: true },
      create: { name: d.name },
    });
    deptIds.set(d.name, dept.id);

    for (const h of d.heads) {
      // Head login user.
      const email = h.email;
      const headUser = await prisma.user.upsert({
        where: { email },
        update: { role: 'DEPARTMENT_HEAD', departmentId: dept.id, isActive: true },
        create: { name: h.name, email, passwordHash: password, role: 'DEPARTMENT_HEAD', departmentId: dept.id },
      });

      // Head record, linked to the user.
      const head = await prisma.departmentHead.upsert({
        where: { departmentId_name: { departmentId: dept.id, name: h.name } },
        update: { isActive: true, userId: headUser.id },
        create: { departmentId: dept.id, name: h.name, userId: headUser.id },
      });

      // Budget allocation for this head (annual split evenly across 12 months).
      await prisma.budget.create({
        data: {
          departmentId: dept.id,
          deptHeadId: head.id,
          fyId: fy.id,
          annualAmount: h.budget,
          monthlyAmounts: evenMonthlySplit(h.budget),
        },
      });
    }

    // Retire any heads (and their login users) no longer in this dept's config,
    // e.g. after renaming a head. Guarded so an empty config never nukes all heads.
    const validNames = d.heads.map((h) => h.name);
    if (validNames.length > 0) {
      const staleHeads = await prisma.departmentHead.findMany({
        where: { departmentId: dept.id, name: { notIn: validNames }, isActive: true },
      });
      for (const sh of staleHeads) {
        await prisma.departmentHead.update({ where: { id: sh.id }, data: { isActive: false } });
        if (sh.userId) await prisma.user.update({ where: { id: sh.userId }, data: { isActive: false, departmentId: null } });
      }
    }
  }

  // A sample employee in Operations.
  const opsId = deptIds.get('Operations')!;
  await prisma.user.upsert({
    where: { email: 'employee@dhaninfo.biz' },
    update: { role: 'EMPLOYEE', departmentId: opsId, isActive: true },
    create: { name: 'Eve Employee', email: 'employee@dhaninfo.biz', passwordHash: password, role: 'EMPLOYEE', departmentId: opsId },
  });

  const [users, budgets] = await Promise.all([prisma.user.count({ where: { isActive: true } }), prisma.budget.count()]);
  console.log(`Seed complete. ${users} active users, ${budgets} budget allocations, 0 expenses.`);
  console.log(`Logins (password: ${DEFAULT_PASSWORD}):`);
  console.log('  Admin:      admin@dhaninfo.biz');
  console.log('  Dept heads: vikas.jain@dhaninfo.biz, sales@dhaninfo.biz, satish@dhaninfo.biz, …');
  console.log('  Employee:   employee@dhaninfo.biz');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
