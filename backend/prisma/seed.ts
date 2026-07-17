import { PrismaClient, PaymentMode, ExpenseStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Departments, heads, and annual budgets from "Engage 360 data.xlsx"
// (Leadership Discretionary Fund Distribution - 15 Lacs, allocated by headcount).
// One department can have multiple heads; each budget is per dept-head pair.
// Departments without heads carry the budget at department level (head = null).
const DEPARTMENTS: { name: string; heads: { name: string; budget: number }[]; budget?: number }[] = [
  {
    name: 'Operations',
    heads: [
      { name: 'Rakesh', budget: 375691.94 },
      { name: 'Vikas', budget: 458243.08 },
      { name: 'Solomon', budget: 148255.11 },
      { name: 'Ruchita', budget: 163417.57 },
      { name: 'Himanshu', budget: 23586.04 },
      { name: 'Ritesh', budget: 126353.79 },
    ],
  },
  { name: 'Information Technology', heads: [{ name: 'Satish', budget: 21901.32 }] },
  { name: 'Human Resource', heads: [{ name: 'Abhijeet', budget: 25270.76 }] },
  { name: 'Administration', heads: [{ name: 'Prashik', budget: 18531.89 }] },
  { name: 'Artificial Intelligence', heads: [{ name: 'Kanchan', budget: 8423.59 }] },
  { name: 'Accounts & Finance', heads: [], budget: 5054.15 },
  { name: 'Sales & Marketing', heads: [], budget: 26955.48 },
];

// Categories and budgets from the "Objectives" table in the Excel.
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

const VENDORS = [
  { name: 'Amazon India', gstNo: '29AAICA3918J1ZE' },
  { name: 'Zomato Corporate', gstNo: '06AAACZ4322M1ZL' },
  { name: 'Ferns N Petals', gstNo: '07AABCF5150R1ZE' },
  { name: 'Decathlon Sports India', gstNo: '29AACCD0838Q1ZI' },
  { name: 'PVR Cinemas', gstNo: '07AAACP0564N1ZD' },
  { name: 'Printo Document Services', gstNo: '29AABCP9503E1ZW' },
  { name: 'Urban Company', gstNo: '09AABCU3244G1ZK' },
  { name: 'Chai Point', gstNo: '29AAECM4438Q1ZV' },
  { name: 'BookMyShow', gstNo: '27AAECB2136E1ZR' },
  { name: 'Croma Retail', gstNo: '27AACCI7194D1ZO' },
];

function evenMonthlySplit(annual: number): number[] {
  const base = Math.floor((annual / 12) * 100) / 100;
  const amounts = new Array(12).fill(base);
  const remainder = Math.round((annual - base * 12) * 100) / 100;
  amounts[11] = Math.round((amounts[11] + remainder) * 100) / 100;
  return amounts;
}

// Deterministic pseudo-random so reseeding produces the same dummy data.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXPENSE_NOTES: Record<string, string[]> = {
  E01: ['Leadership summit venue booking', 'Summit travel & stay'],
  E02: ['Team lunch with leadership', 'Quarterly team outing', 'Team dinner - project milestone'],
  E03: ['Spot award vouchers', 'Star performer trophies', 'Quarterly R&R gifts'],
  E04: ['Yoga session for team', 'Health check-up camp', 'Ergonomic accessories'],
  E05: ['Diwali decoration & sweets', 'Holi celebration snacks', 'Festival gift hampers'],
  E06: ['Cricket club equipment', 'Board games for club', 'Photography club supplies'],
  E07: ['Family day passes', 'Appreciation dinner', 'Anniversary gift'],
  E08: ['Welcome kits for new joiners', 'Friday fun activity', 'Office games supplies'],
  E09: ['Online course licences', 'Workshop registration', 'Books for library'],
  E10: ['Hackathon prizes', 'Innovation demo material', 'Prototype supplies'],
};

async function main() {
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

  console.log('Seeding departments, heads, and budgets...');
  // Detach users from soon-to-be-deactivated legacy departments ("Operations - Vikas" style).
  const legacyNames = DEPARTMENTS.map((d) => d.name);
  const legacyDepts = await prisma.department.findMany({ where: { name: { notIn: legacyNames } } });
  if (legacyDepts.length > 0) {
    await prisma.user.updateMany({
      where: { departmentId: { in: legacyDepts.map((d) => d.id) } },
      data: { departmentId: null },
    });
    await prisma.department.updateMany({
      where: { id: { in: legacyDepts.map((d) => d.id) } },
      data: { isActive: false },
    });
  }

  // budget targets per (deptId, headId-or-null) used for dummy expense generation
  const budgetTargets: { departmentId: string; deptHeadId: string | null; deptName: string; headName: string | null; budget: number }[] = [];
  const deptIds = new Map<string, string>();

  for (const d of DEPARTMENTS) {
    const dept = await prisma.department.upsert({
      where: { name: d.name },
      update: { isActive: true },
      create: { name: d.name },
    });
    deptIds.set(d.name, dept.id);

    for (const h of d.heads) {
      const head = await prisma.departmentHead.upsert({
        where: { departmentId_name: { departmentId: dept.id, name: h.name } },
        update: { isActive: true },
        create: { departmentId: dept.id, name: h.name },
      });
      await prisma.budget.create({
        data: {
          departmentId: dept.id,
          deptHeadId: head.id,
          fyId: fy.id,
          annualAmount: h.budget,
          monthlyAmounts: evenMonthlySplit(h.budget),
        },
      });
      budgetTargets.push({ departmentId: dept.id, deptHeadId: head.id, deptName: d.name, headName: h.name, budget: h.budget });
    }

    if (d.heads.length === 0 && d.budget) {
      await prisma.budget.create({
        data: {
          departmentId: dept.id,
          deptHeadId: null,
          fyId: fy.id,
          annualAmount: d.budget,
          monthlyAmounts: evenMonthlySplit(d.budget),
        },
      });
      budgetTargets.push({ departmentId: dept.id, deptHeadId: null, deptName: d.name, headName: null, budget: d.budget });
    }
  }

  console.log('Seeding vendors...');
  const vendorIds: string[] = [];
  for (const v of VENDORS) {
    const existing = await prisma.vendor.findFirst({ where: { name: v.name } });
    const vendor = existing ?? (await prisma.vendor.create({ data: v }));
    vendorIds.push(vendor.id);
  }

  console.log('Seeding users...');
  const password = await bcrypt.hash('Passw0rd!', 10);
  const opsId = deptIds.get('Operations')!;

  const admin = await prisma.user.upsert({
    where: { email: 'admin@exptrack.local' },
    update: {},
    create: { name: 'Ava Admin', email: 'admin@exptrack.local', passwordHash: password, role: 'ADMIN' },
  });

  const deptHead = await prisma.user.upsert({
    where: { email: 'depthead@exptrack.local' },
    update: { departmentId: opsId },
    create: {
      name: 'Dana DeptHead', email: 'depthead@exptrack.local', passwordHash: password,
      role: 'DEPARTMENT_HEAD', departmentId: opsId,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@exptrack.local' },
    update: { departmentId: opsId },
    create: {
      name: 'Max Manager', email: 'manager@exptrack.local', passwordHash: password,
      role: 'MANAGER', departmentId: opsId, managerId: deptHead.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'employee@exptrack.local' },
    update: { departmentId: opsId },
    create: {
      name: 'Eve Employee', email: 'employee@exptrack.local', passwordHash: password,
      role: 'EMPLOYEE', departmentId: opsId, managerId: manager.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'accounts@exptrack.local' },
    update: {},
    create: { name: 'Ann Accounts', email: 'accounts@exptrack.local', passwordHash: password, role: 'ACCOUNTS' },
  });

  console.log('Seeding dummy expenses...');
  const rand = mulberry32(360360);
  const spendableCategories = CATEGORIES.filter((c) => c.code !== 'E00');
  const categoryIds = new Map<string, string>();
  for (const c of spendableCategories) {
    categoryIds.set(c.code, (await prisma.accountsCategory.findUnique({ where: { code: c.code } }))!.id);
  }
  const paymentModes: PaymentMode[] = ['UPI', 'BANK_TRANSFER', 'CREDIT_CARD', 'CASH', 'DEBIT_CARD'];
  // Invoice dates spread over Apr-Jul 2026 (FY2026-27 so far).
  const fyStart = new Date('2026-04-05').getTime();
  const fyUpto = new Date('2026-07-14').getTime();

  let invoiceCounter = 1000;
  for (const t of budgetTargets) {
    const count = 3 + Math.floor(rand() * 3); // 3-5 expenses per budget line
    // Target 25-65% utilization of the allocated budget, split across its expenses.
    const targetSpend = t.budget * (0.25 + rand() * 0.4);

    for (let i = 0; i < count; i++) {
      const share = targetSpend / count;
      const amount = Math.max(250, Math.round(share * (0.6 + rand() * 0.8)));
      const cat = spendableCategories[Math.floor(rand() * spendableCategories.length)];
      const notes = EXPENSE_NOTES[cat.code] ?? ['Engagement activity expense'];
      const gst = rand() > 0.4 ? Math.round(amount * 0.18 * 100) / 100 : null;
      const invoiceDate = new Date(fyStart + rand() * (fyUpto - fyStart));

      await prisma.expense.create({
        data: {
          userId: admin.id,
          departmentId: t.departmentId,
          deptHeadId: t.deptHeadId,
          vendorId: vendorIds[Math.floor(rand() * vendorIds.length)],
          categoryId: categoryIds.get(cat.code)!,
          invoiceNo: `INV-${++invoiceCounter}`,
          invoiceDate,
          amount,
          currency: 'INR',
          gstAmount: gst,
          paymentMode: paymentModes[Math.floor(rand() * paymentModes.length)],
          description: notes[Math.floor(rand() * notes.length)],
          fyId: fy.id,
          status: ExpenseStatus.SUBMITTED,
        },
      });
    }
  }

  // A few draft expenses so the Draft filter/flows have data out of the box.
  const draftSamples = [
    { dept: 'Operations', head: 'Vikas', amount: 4200, note: 'Team offsite venue advance (draft)' },
    { dept: 'Human Resource', head: 'Abhijeet', amount: 1800, note: 'Welcome kit vendor quote (draft)' },
    { dept: 'Sales & Marketing', head: null, amount: 2600, note: 'Client meet snacks (draft)' },
  ];
  for (const s of draftSamples) {
    const departmentId = deptIds.get(s.dept)!;
    const head = s.head
      ? await prisma.departmentHead.findUnique({ where: { departmentId_name: { departmentId, name: s.head } } })
      : null;
    await prisma.expense.create({
      data: {
        userId: admin.id,
        departmentId,
        deptHeadId: head?.id ?? null,
        categoryId: categoryIds.get('E02')!,
        invoiceDate: new Date('2026-07-10'),
        amount: s.amount,
        currency: 'INR',
        paymentMode: 'UPI',
        description: s.note,
        fyId: fy.id,
        status: ExpenseStatus.DRAFT,
      },
    });
  }

  const expenseCount = await prisma.expense.count();
  console.log(`Seed complete. ${expenseCount} dummy expenses created (incl. ${draftSamples.length} drafts).`);
  console.log('Demo logins (password: Passw0rd!):');
  console.log('  admin@exptrack.local, depthead@exptrack.local, manager@exptrack.local, employee@exptrack.local, accounts@exptrack.local');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
