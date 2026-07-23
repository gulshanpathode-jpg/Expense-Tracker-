import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Wallet,
  ReceiptText,
  PiggyBank,
  CalendarDays,
  ChevronDown,
  ArrowUpDown,
  TrendingUp,
  CircleCheck,
  TriangleAlert,
} from 'lucide-react';
import { api } from '../api/client';
import type { Department, DashboardSummary, DepartmentStat, FinancialYear } from '../api/types';
import { useAuthStore } from '../store/authStore';
import { money, moneyCompact } from '../lib/format';
import { FilterField } from '../components/ui';
import Select from '../components/Select';
import DatePicker from '../components/DatePicker';

// Validated dataviz palette (fixed slot order — never cycled).
const CAT = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];
const OTHER_GRAY = '#898781';
const SERIES_BLUE = '#2a78d6';
const SERIES_AQUA = '#1baf7a';
const STATUS_WARNING = '#fab219';
const STATUS_CRITICAL = '#d03b3b';
const STATUS_OK = '#0ca30c';
const GRID = '#e1e0d9';
const AXIS_TEXT = '#898781';
const REMAIN_TRACK = '#eef0f2';

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: '1px solid #e1e0d9',
  boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)',
  background: '#fff',
} as const;

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
}

const canFilterDepartment = (role?: string) => role === 'ADMIN' || role === 'ACCOUNTS';

// Spent-bar color by budget pressure: normal → base, ≥90% → warning, over → critical.
function pressureColor(pct: number, base: string) {
  if (pct >= 100) return STATUS_CRITICAL;
  if (pct >= 90) return STATUS_WARNING;
  return base;
}

// ---- Quick date ranges (ICICI-statement style chips) ----

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Indian FY quarters: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar.
function quarterRange(fyStartYear: number, quarter: 1 | 2 | 3 | 4): { from: string; to: string } {
  const startMonth = 3 + (quarter - 1) * 3; // Apr=3
  const from = new Date(fyStartYear, startMonth, 1);
  const to = new Date(fyStartYear, startMonth + 3, 0);
  return { from: ymd(from), to: ymd(to) };
}

function buildQuickRanges(fy: FinancialYear | undefined): { key: string; label: string; from: string; to: string }[] {
  const today = new Date();
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const last30Start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);

  const fyStartYear = fy ? new Date(fy.startDate).getFullYear() : today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;

  return [
    { key: 'this-month', label: 'This month', from: ymd(thisMonthStart), to: ymd(today) },
    { key: 'last-month', label: 'Last month', from: ymd(lastMonthStart), to: ymd(lastMonthEnd) },
    { key: 'last-30', label: 'Last 30 days', from: ymd(last30Start), to: ymd(today) },
    { key: 'q1', label: 'Q1 (Apr–Jun)', ...quarterRange(fyStartYear, 1) },
    { key: 'q2', label: 'Q2 (Jul–Sep)', ...quarterRange(fyStartYear, 2) },
    { key: 'q3', label: 'Q3 (Oct–Dec)', ...quarterRange(fyStartYear, 3) },
    { key: 'q4', label: 'Q4 (Jan–Mar)', ...quarterRange(fyStartYear, 4) },
  ];
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isHead = user?.role === 'DEPARTMENT_HEAD';
  const isOwner = user?.role === 'OWNER';
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);

  const [fyId, setFyId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [quickRange, setQuickRange] = useState('');

  useEffect(() => {
    if (canFilterDepartment(user?.role)) {
      api.get('/departments').then((res) => setDepartments(res.data.filter((d: Department) => d.isActive)));
    }
    api.get('/financial-years').then((res) => setFinancialYears(res.data));
  }, [user?.role]);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (fyId) params.fyId = fyId;
    if (departmentId) params.departmentId = departmentId;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    api
      .get('/dashboard/summary', { params })
      .then((res) => setSummary(res.data))
      .finally(() => setLoading(false));
  }, [fyId, departmentId, dateFrom, dateTo]);

  const resetFilters = () => {
    setFyId('');
    setDepartmentId('');
    setDateFrom('');
    setDateTo('');
    setQuickRange('');
  };

  const filtersActive = !!(fyId || departmentId || dateFrom || dateTo);

  const departmentOptions = useMemo(() => departments.map((d) => ({ value: d.id, label: d.name })), [departments]);
  const fyOptions = useMemo(() => financialYears.map((fy) => ({ value: fy.id, label: fy.label })), [financialYears]);

  const quickRanges = useMemo(
    () => buildQuickRanges(financialYears.find((fy) => fy.id === fyId)),
    [financialYears, fyId],
  );

  const applyQuickRange = (key: string) => {
    if (quickRange === key) {
      setQuickRange('');
      setDateFrom('');
      setDateTo('');
      return;
    }
    const r = quickRanges.find((x) => x.key === key)!;
    setQuickRange(key);
    setDateFrom(r.from);
    setDateTo(r.to);
  };

  const trendData = useMemo(
    () => (summary?.monthlyTrend ?? []).map((m) => ({ month: monthLabel(m.month), amount: m.amount })),
    [summary],
  );

  const utilizationPct = summary?.utilizationPct ?? 0;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {isHead || isOwner ? `${user?.name?.split(' ')[0]}'s ${isOwner ? 'Portfolio' : 'Dashboard'}` : 'Admin Dashboard'}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {isOwner
            ? 'Budgets and spending across the heads you oversee.'
            : isHead
            ? 'Your budget and spending at a glance.'
            : 'Company-wide Engage360 budgets and spending at a glance.'}
        </p>
      </div>

      <div className="card mb-6 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Financial Year">
            <Select value={fyId} onChange={setFyId} options={fyOptions} placeholder="All" clearable className="min-w-36" />
          </FilterField>

          {canFilterDepartment(user?.role) && (
            <FilterField label="Department">
              <Select value={departmentId} onChange={setDepartmentId} options={departmentOptions} placeholder="All" clearable className="min-w-52" />
            </FilterField>
          )}

          <FilterField label="From">
            <DatePicker
              value={dateFrom}
              onChange={(v) => {
                setDateFrom(v);
                setQuickRange('');
              }}
            />
          </FilterField>

          <FilterField label="To">
            <DatePicker
              value={dateTo}
              onChange={(v) => {
                setDateTo(v);
                setQuickRange('');
              }}
            />
          </FilterField>

          {filtersActive && (
            <button onClick={resetFilters} className="btn-ghost btn-sm mb-0.5">
              Clear filters
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Quick range</span>
          {quickRanges.map((r) => (
            <button
              key={r.key}
              onClick={() => applyQuickRange(r.key)}
              className={
                quickRange === r.key
                  ? 'rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white'
                  : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !summary && <DashboardSkeleton />}

      {summary && (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* Stat tiles */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label={isHead ? 'My Budget' : isOwner ? 'Portfolio Budget' : 'Total Budget'}
              value={money(summary.totalBudget)}
              caption={fyId ? undefined : 'across all financial years'}
              icon={<Wallet size={17} />}
              tint="bg-brand-50 text-brand-600"
            />
            <MetricCard
              label="Total Spent"
              value={money(summary.totalSpent)}
              caption={`${summary.expenseCount} expense${summary.expenseCount === 1 ? '' : 's'} · avg ${money(summary.avgExpense)}`}
              icon={<ReceiptText size={17} />}
              tint="bg-sky-50 text-sky-600"
              meterPct={summary.totalBudget > 0 ? utilizationPct : undefined}
            />
            <MetricCard
              label="Remaining"
              value={money(summary.totalRemaining)}
              caption={summary.totalBudget > 0 ? `${Math.max(0, 100 - utilizationPct).toFixed(0)}% of budget left` : undefined}
              icon={<PiggyBank size={17} />}
              tint="bg-emerald-50 text-emerald-600"
            />
            <MetricCard
              label="This Month"
              value={money(summary.monthlySpend)}
              caption="spend recorded this month"
              icon={<CalendarDays size={17} />}
              tint="bg-amber-50 text-amber-600"
            />
          </div>

          {isHead ? (
            <HeadDashboard summary={summary} trendData={trendData} />
          ) : (
            <AdminDashboard summary={summary} trendData={trendData} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin (company-wide) content
// ---------------------------------------------------------------------------

type SortKey = 'utilization' | 'allocated' | 'spent';

function AdminDashboard({ summary, trendData }: { summary: DashboardSummary; trendData: { month: string; amount: number }[] }) {
  const donutData = useMemo(() => {
    const spenders = (summary.departmentStats ?? []).filter((d) => d.spent > 0).sort((a, b) => b.spent - a.spent);
    const top = spenders.slice(0, 7).map((d, i) => ({ name: d.name, value: d.spent, color: CAT[i] }));
    const rest = spenders.slice(7);
    if (rest.length > 0) {
      top.push({ name: `Other (${rest.length})`, value: rest.reduce((s, d) => s + d.spent, 0), color: OTHER_GRAY });
    }
    return top;
  }, [summary]);
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <DepartmentBudgetTable departments={summary.departmentStats} />
        </div>

        <div className="card p-5 lg:col-span-2">
          <h2 className="card-title mb-4">Share of Spend by Department</h2>
          {donutData.length > 0 ? (
            <>
              <div className="relative mx-auto h-52 w-full max-w-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="95%" paddingAngle={1.5} strokeWidth={2} stroke="#fff">
                      {donutData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, name) => [`${money(Number(v))} (${donutTotal ? ((Number(v) / donutTotal) * 100).toFixed(1) : 0}%)`, String(name)]}
                      contentStyle={TOOLTIP_STYLE}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[11px] font-medium text-slate-400">Total Spent</span>
                  <span className="num text-lg font-semibold tracking-tight text-slate-900">{moneyCompact(donutTotal)}</span>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5">
                {donutData.map((d) => (
                  <li key={d.name} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} />
                      <span className="truncate">{d.name}</span>
                    </span>
                    <span className="num shrink-0 text-slate-500">
                      {money(d.value)} · {donutTotal ? ((d.value / donutTotal) * 100).toFixed(0) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <ChartEmpty text="No spend recorded yet." />
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CategoryBudgetCard summary={summary} />
        <TrendCard trendData={trendData} />
      </div>
    </>
  );
}

// Redesigned "Allocated vs Spent": a ranked table with spent/remaining split
// bars and utilization meters, most-pressured departments first, with a
// health summary and expandable per-head rows.
function DepartmentBudgetTable({ departments }: { departments: DepartmentStat[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('utilization');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    const copy = [...departments];
    copy.sort((a, b) => {
      if (sortKey === 'utilization') return b.pct - a.pct;
      if (sortKey === 'allocated') return b.allocated - a.allocated;
      return b.spent - a.spent;
    });
    return copy;
  }, [departments, sortKey]);

  const overBudget = departments.filter((d) => d.pct >= 100).length;
  const nearLimit = departments.filter((d) => d.pct >= 90 && d.pct < 100).length;

  const nextSort = () => setSortKey((k) => (k === 'utilization' ? 'allocated' : k === 'allocated' ? 'spent' : 'utilization'));
  const sortLabel = sortKey === 'utilization' ? 'Utilization' : sortKey === 'allocated' ? 'Allocated' : 'Spent';

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h2 className="card-title">Department Budgets: Allocated vs Spent</h2>
        <button onClick={nextSort} className="btn-ghost btn-sm shrink-0" title="Change sort order">
          <ArrowUpDown size={13} />
          {sortLabel}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1"><CircleCheck size={13} className="text-emerald-500" />{departments.length} departments</span>
        {nearLimit > 0 && <span className="flex items-center gap-1" style={{ color: STATUS_WARNING }}><TriangleAlert size={13} />{nearLimit} near limit</span>}
        {overBudget > 0 && <span className="flex items-center gap-1" style={{ color: STATUS_CRITICAL }}><TriangleAlert size={13} />{overBudget} over budget</span>}
      </div>

      <div className="space-y-2.5">
        {rows.map((d) => {
          const hasHeads = d.heads.some((h) => h.deptHeadId);
          const isOpen = !!expanded[d.departmentId];
          const spentPct = d.allocated > 0 ? Math.min(100, (d.spent / d.allocated) * 100) : d.spent > 0 ? 100 : 0;
          const over = d.pct > 100;
          return (
            <div key={d.departmentId} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => hasHeads && setExpanded((e) => ({ ...e, [d.departmentId]: !isOpen }))}
                  className={`flex min-w-0 items-center gap-1 text-sm font-medium text-slate-800 ${hasHeads ? 'hover:text-brand-700' : 'cursor-default'}`}
                >
                  <span className="truncate">{d.name}</span>
                  {hasHeads && (
                    <ChevronDown size={13} className={`shrink-0 text-slate-400 ${isOpen ? 'rotate-180 transition-transform' : 'transition-transform'}`} />
                  )}
                </button>
                <span
                  className="num shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    color: d.allocated === 0 ? AXIS_TEXT : d.pct >= 100 ? STATUS_CRITICAL : d.pct >= 90 ? '#8a6d0b' : STATUS_OK,
                    background: d.allocated === 0 ? '#f1f5f9' : d.pct >= 100 ? '#fdeaea' : d.pct >= 90 ? '#fdf4e0' : '#e9f7e9',
                  }}
                >
                  {d.allocated > 0 ? `${d.pct.toFixed(0)}%` : 'no budget'}
                </span>
              </div>

              {/* Spent / remaining split bar */}
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full" style={{ background: REMAIN_TRACK }} title={`Spent ${money(d.spent)} of ${money(d.allocated)}`}>
                <div className="h-full rounded-full transition-all" style={{ width: `${spentPct}%`, background: pressureColor(d.pct, SERIES_BLUE) }} />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px]">
                <span className="num text-slate-600">
                  {money(d.spent)} <span className="text-slate-400">spent</span>
                </span>
                <span className="num text-slate-500">
                  {over ? (
                    <span style={{ color: STATUS_CRITICAL }}>{money(d.spent - d.allocated)} over</span>
                  ) : (
                    <>
                      {money(d.remaining)} <span className="text-slate-400">left of {money(d.allocated)}</span>
                    </>
                  )}
                </span>
              </div>

              {isOpen && hasHeads && (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  {d.heads.map((h) => {
                    const hw = h.allocated > 0 ? Math.min(100, (h.spent / h.allocated) * 100) : h.spent > 0 ? 100 : 0;
                    return (
                      <div key={h.deptHeadId ?? 'none'} title={`${h.name}: ${money(h.spent)} of ${money(h.allocated)}`}>
                        <div className="mb-0.5 flex items-baseline justify-between gap-3 text-[11px]">
                          <span className="min-w-0 truncate text-slate-600">{h.name}</span>
                          <span className="num shrink-0 text-slate-500">
                            {money(h.spent)} <span className="text-slate-400">/ {money(h.allocated)}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: REMAIN_TRACK }}>
                            <div className="h-full rounded-full" style={{ width: `${hw}%`, background: pressureColor(h.pct, SERIES_AQUA) }} />
                          </div>
                          <span className="num w-9 shrink-0 text-right text-[11px]" style={{ color: h.pct >= 100 ? STATUS_CRITICAL : AXIS_TEXT }}>
                            {h.allocated > 0 ? `${h.pct.toFixed(0)}%` : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <ChartEmpty text="No department budgets yet." />}
      </div>

      {rows.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <LegendDot color={SERIES_BLUE} label="On track" />
          <LegendDot color={STATUS_WARNING} label="≥ 90% used" />
          <LegendDot color={STATUS_CRITICAL} label="Over budget" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Department-head content (their own head-slice)
// ---------------------------------------------------------------------------

function HeadDashboard({ summary, trendData }: { summary: DashboardSummary; trendData: { month: string; amount: number }[] }) {
  // A head-slice returns a single department stat with a single head line.
  const slice = summary.departmentStats[0];
  const utilization = summary.utilizationPct;
  const status = utilization >= 100 ? 'over' : utilization >= 90 ? 'near' : 'ok';
  const statusMeta = {
    ok: { color: STATUS_OK, bg: '#e9f7e9', label: 'On track', icon: <CircleCheck size={15} /> },
    near: { color: '#8a6d0b', bg: '#fdf4e0', label: 'Near limit', icon: <TriangleAlert size={15} /> },
    over: { color: STATUS_CRITICAL, bg: '#fdeaea', label: 'Over budget', icon: <TriangleAlert size={15} /> },
  }[status];

  const categorySpend = useMemo(
    () =>
      (summary.categoryStats ?? [])
        .filter((c) => c.spent > 0)
        .sort((a, b) => b.spent - a.spent)
        .slice(0, 8)
        .map((c) => ({ name: c.name, spent: c.spent })),
    [summary],
  );

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Budget health */}
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="card-title">Budget Health</h2>
            <span className="badge" style={{ color: statusMeta.color, background: statusMeta.bg }}>
              {statusMeta.icon}
              {statusMeta.label}
            </span>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Utilized</p>
              <p className="num text-3xl font-semibold tracking-tight text-slate-900">{utilization.toFixed(0)}%</p>
            </div>
            <div className="text-right">
              <p className="num text-sm font-semibold text-slate-700">{money(summary.totalSpent)}</p>
              <p className="num text-xs text-slate-400">of {money(summary.totalBudget)}</p>
            </div>
          </div>

          <div className="mt-3 h-3 overflow-hidden rounded-full" style={{ background: REMAIN_TRACK }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, utilization)}%`, background: statusMeta.color }}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat label="Remaining" value={money(summary.totalRemaining)} tone={summary.totalRemaining < 0 ? 'bad' : 'good'} />
            <MiniStat label="Expenses" value={String(summary.expenseCount)} />
          </div>
          {slice?.name && (
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
              Scope: {slice.name}
              {slice.heads[0]?.name ? ` · ${slice.heads[0].name}` : ''}
            </p>
          )}
        </div>

        {/* Category split for their slice */}
        <div className="card p-5 lg:col-span-3">
          <h2 className="card-title mb-1 flex items-center gap-1.5">
            <TrendingUp size={15} className="text-brand-500" />
            Where My Budget Goes
          </h2>
          <p className="mb-3 text-xs text-slate-400">Your spend by category (top categories)</p>
          {categorySpend.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, categorySpend.length * 40)}>
              <BarChart data={categorySpend} layout="vertical" margin={{ top: 0, right: 20, left: 8, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={{ fill: AXIS_TEXT, fontSize: 11 }} axisLine={{ stroke: GRID }} tickLine={false} tickFormatter={(v) => moneyCompact(Number(v))} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: '#52514e', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={150}
                  tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 23)}…` : v)}
                />
                <Tooltip formatter={(v) => [money(Number(v)), 'Spent']} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgb(15 23 42 / 0.03)' }} />
                <Bar dataKey="spent" fill={SERIES_AQUA} radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty text="No spend recorded yet." />
          )}
        </div>
      </div>

      <div className="mb-6">
        <TrendCard trendData={trendData} />
      </div>
    </>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={`num text-base font-semibold ${tone === 'bad' ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared cards
// ---------------------------------------------------------------------------

function CategoryBudgetCard({ summary }: { summary: DashboardSummary }) {
  // Sort most-pressured first so the categories that need attention surface.
  const cats = useMemo(() => (summary.categoryStats ?? []).slice().sort((a, b) => b.pct - a.pct), [summary]);
  const overBudget = cats.filter((c) => c.pct >= 100).length;
  const nearLimit = cats.filter((c) => c.pct >= 90 && c.pct < 100).length;

  return (
    <div className="card p-5">
      <h2 className="card-title mb-1">Category Budgets: Budget vs Spent</h2>
      <p className="mb-3 text-xs text-slate-400">
        Company-wide category budgets from the Engage360 plan · each bar is spend against that category's own budget
      </p>

      {cats.length > 0 ? (
        <>
          {(overBudget > 0 || nearLimit > 0) && (
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {overBudget > 0 && (
                <span className="flex items-center gap-1 font-medium" style={{ color: STATUS_CRITICAL }}>
                  <TriangleAlert size={13} />
                  {overBudget} over budget
                </span>
              )}
              {nearLimit > 0 && (
                <span className="flex items-center gap-1 font-medium" style={{ color: '#8a6d0b' }}>
                  <TriangleAlert size={13} />
                  {nearLimit} near limit
                </span>
              )}
            </div>
          )}

          <div className="space-y-3.5">
            {cats.map((c) => (
              <CategoryBudgetRow key={c.categoryId} cat={c} />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <LegendDot color={SERIES_AQUA} label="On track" />
            <LegendDot color={STATUS_WARNING} label="≥ 90% used" />
            <LegendDot color={STATUS_CRITICAL} label="Over budget" />
          </div>
        </>
      ) : (
        <ChartEmpty text="No category budgets configured." />
      )}
    </div>
  );
}

function CategoryBudgetRow({ cat }: { cat: DashboardSummary['categoryStats'][number] }) {
  const spentPct = cat.budget > 0 ? Math.min(100, (cat.spent / cat.budget) * 100) : cat.spent > 0 ? 100 : 0;
  const over = cat.pct > 100;
  const color = pressureColor(cat.pct, SERIES_AQUA);

  return (
    <div title={`${cat.name}: spent ${money(cat.spent)} of ${money(cat.budget)} (${cat.pct.toFixed(0)}%)`}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-xs font-medium text-slate-700">{cat.name}</span>
        <span className="num shrink-0 text-xs text-slate-500">
          {money(cat.spent)} <span className="text-slate-400">/ {money(cat.budget)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: REMAIN_TRACK }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${spentPct}%`, background: color }} />
        </div>
        <span
          className="num w-10 shrink-0 text-right text-[11px] font-semibold"
          style={{ color: over ? STATUS_CRITICAL : cat.pct >= 90 ? '#8a6d0b' : '#52514e' }}
        >
          {cat.budget > 0 ? `${cat.pct.toFixed(0)}%` : '—'}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
        <span>{cat.count} expense{cat.count === 1 ? '' : 's'}</span>
        <span>
          {over ? (
            <span style={{ color: STATUS_CRITICAL }}>{money(cat.spent - cat.budget)} over budget</span>
          ) : (
            `${money(cat.remaining)} left`
          )}
        </span>
      </div>
    </div>
  );
}

function TrendCard({ trendData }: { trendData: { month: string; amount: number }[] }) {
  return (
    <div className="card p-5">
      <h2 className="card-title mb-4">Monthly Spend Trend</h2>
      {trendData.some((d) => d.amount > 0) ? (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES_BLUE} stopOpacity={0.18} />
                <stop offset="100%" stopColor={SERIES_BLUE} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" tick={{ fill: AXIS_TEXT, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
            <YAxis tick={{ fill: AXIS_TEXT, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => moneyCompact(Number(v))} width={56} />
            <Tooltip formatter={(v) => [money(Number(v)), 'Spend']} contentStyle={TOOLTIP_STYLE} cursor={{ stroke: AXIS_TEXT, strokeDasharray: '3 3' }} />
            <Area type="monotone" dataKey="amount" stroke={SERIES_BLUE} strokeWidth={2} fill="url(#spendFill)" dot={false} activeDot={{ r: 4.5, strokeWidth: 2, stroke: '#fff' }} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <ChartEmpty text="No expenses in this period." />
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  caption,
  icon,
  tint,
  meterPct,
}: {
  label: string;
  value: string;
  caption?: string;
  icon: ReactNode;
  tint: string;
  meterPct?: number;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="num mt-1.5 truncate text-xl font-semibold tracking-tight text-slate-900">{value}</p>
          {caption && <p className="mt-0.5 text-[11px] text-slate-400">{caption}</p>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tint}`}>{icon}</div>
      </div>
      {meterPct !== undefined && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, meterPct)}%`,
                background: meterPct >= 100 ? STATUS_CRITICAL : meterPct >= 90 ? STATUS_WARNING : SERIES_BLUE,
              }}
            />
          </div>
          <p className="num mt-1 text-[11px] text-slate-400">{meterPct.toFixed(0)}% of budget utilized</p>
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function ChartEmpty({ text }: { text: string }) {
  return <p className="py-6 text-sm text-slate-400">{text}</p>;
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="skeleton mb-3 h-3 w-20" />
            <div className="skeleton h-6 w-28" />
          </div>
        ))}
      </div>
      <div className="card mb-6 p-5">
        <div className="skeleton mb-4 h-4 w-48" />
        <div className="skeleton h-52 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="skeleton mb-4 h-4 w-40" />
            <div className="space-y-3">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-4/5" />
              <div className="skeleton h-3 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
