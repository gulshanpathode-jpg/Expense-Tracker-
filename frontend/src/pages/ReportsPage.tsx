import { useEffect, useState } from 'react';
import {
  Building2,
  Wallet,
  Store,
  Users,
  CalendarRange,
  CalendarClock,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { PageHeader } from '../components/ui';
import type { Department } from '../api/types';

type ReportDef = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  supportsPeriod?: boolean;
  // Department-based reports accept the admin's department/head filter.
  supportsDeptFilter?: boolean;
};

// Company-wide reports for the admin (GST report removed).
const ADMIN_REPORTS: ReportDef[] = [
  {
    key: 'department-wise',
    label: 'Department-wise Expense Report',
    description: 'A detailed expense register grouped by department, with head, category, vendor and GST columns and a totals row.',
    icon: Building2,
    supportsPeriod: true,
    supportsDeptFilter: true,
  },
  {
    key: 'budget-utilization',
    label: 'Budget Utilization Report',
    description: 'Allocated vs utilized vs remaining and utilization % per department head, with company totals.',
    icon: Wallet,
    supportsDeptFilter: true,
  },
  {
    key: 'category-wise',
    label: 'Category Budget Report',
    description: 'Budget vs spend, remaining and share-of-spend per category, with a totals row.',
    icon: Users,
  },
  {
    key: 'vendor-spend',
    label: 'Vendor Spending Report',
    description: 'Total spend, count, average per expense and last payment date per vendor.',
    icon: Store,
  },
  {
    key: 'period-summary',
    label: 'Period Summary Report',
    description: 'Department spend and share-of-spend for the selected period.',
    icon: CalendarRange,
    supportsPeriod: true,
    supportsDeptFilter: true,
  },
];

// Reports for a portfolio owner, scoped to the heads they oversee. Dept-
// filterable reports let owners narrow to one department (or head) they own.
const OWNER_REPORTS: ReportDef[] = [
  {
    key: 'department-wise',
    label: 'Portfolio Expense Report',
    description: 'A detailed register of every expense across the heads you oversee, with department, category, vendor and GST columns.',
    icon: Building2,
    supportsPeriod: true,
    supportsDeptFilter: true,
  },
  {
    key: 'budget-utilization',
    label: 'Portfolio Budget Utilization',
    description: 'Allocated vs utilized vs remaining and utilization % for each head in your portfolio.',
    icon: Wallet,
    supportsDeptFilter: true,
  },
  {
    key: 'category-wise',
    label: 'Portfolio Category Spend',
    description: 'Spend and share-of-spend by category across your portfolio.',
    icon: Users,
  },
  {
    key: 'vendor-spend',
    label: 'Portfolio Vendor Spend',
    description: 'Total spend, count and average per vendor across the heads you oversee.',
    icon: Store,
  },
  {
    key: 'period-summary',
    label: 'Portfolio Period Summary',
    description: 'Portfolio spend and share-of-spend for the selected period.',
    icon: CalendarRange,
    supportsPeriod: true,
    supportsDeptFilter: true,
  },
];

// Reports for a department head, scoped to their own head-slice.
const HEAD_REPORTS: ReportDef[] = [
  {
    key: 'department-wise',
    label: 'My Expense Report',
    description: 'A detailed register of every expense in your head-slice, with category, vendor and GST columns.',
    icon: Building2,
    supportsPeriod: true,
  },
  {
    key: 'budget-utilization',
    label: 'My Budget Utilization',
    description: 'Your allocation vs utilized vs remaining and utilization %.',
    icon: Wallet,
  },
  {
    key: 'category-wise',
    label: 'My Category Spend',
    description: 'Your spend and share-of-spend broken down by category.',
    icon: Users,
  },
  {
    key: 'vendor-spend',
    label: 'My Vendor Spend',
    description: 'Total spend, count and average per vendor for your slice.',
    icon: Store,
  },
  {
    key: 'monthly-breakdown',
    label: 'Monthly Spend Breakdown',
    description: 'Your spend and GST totalled by month for the active financial year.',
    icon: CalendarClock,
  },
];

async function downloadReport(
  key: string,
  format: 'xlsx' | 'csv',
  period?: string,
  deptFilter?: { departmentId?: string; deptHeadId?: string; ownerId?: string }
) {
  const params: Record<string, string> = { format };
  if (period) params.period = period;
  if (deptFilter?.departmentId) params.departmentId = deptFilter.departmentId;
  if (deptFilter?.deptHeadId) params.deptHeadId = deptFilter.deptHeadId;
  if (deptFilter?.ownerId) params.ownerId = deptFilter.ownerId;
  const res = await api.get(`/reports/${key}`, { params, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${key}-report.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const user = useAuthStore((s) => s.user);
  const isHead = user?.role === 'DEPARTMENT_HEAD';
  const isOwner = user?.role === 'OWNER';
  const reports = isHead ? HEAD_REPORTS : isOwner ? OWNER_REPORTS : ADMIN_REPORTS;

  const [period, setPeriod] = useState('monthly');
  const [downloading, setDownloading] = useState<string | null>(null);

  // Department/head filter for department-based reports. Admins also get an
  // owner filter; owners get a filter scoped to their own portfolio.
  const isAdmin = user?.role === 'ADMIN';
  const canDeptFilter = isAdmin || isOwner;
  const [departments, setDepartments] = useState<Department[]>([]);
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [deptFilter, setDeptFilter] = useState(''); // '' = all departments
  const [headFilter, setHeadFilter] = useState(''); // '' = all heads
  const [ownerFilter, setOwnerFilter] = useState(''); // '' = all owners (admin only)

  useEffect(() => {
    if (!canDeptFilter) return;
    api.get('/departments').then((res) => {
      const active = res.data.filter((d: Department) => d.isActive);
      // Owners only filter within the departments their portfolio spans.
      setDepartments(isOwner ? active.filter((d: Department) => (d.heads ?? []).some((h) => h.ownerId === user?.id)) : active);
    });
    if (isAdmin) {
      api
        .get('/users')
        .then((res) => setOwners(res.data.filter((u: { role: string; isActive: boolean }) => u.role === 'OWNER' && u.isActive)));
    }
  }, [canDeptFilter, isAdmin, isOwner, user?.id]);

  const filterDept = departments.find((d) => d.id === deptFilter);
  // Owners only pick from the heads they own within the chosen department.
  const headChoices = (filterDept?.heads ?? []).filter((h) => !isOwner || h.ownerId === user?.id);

  const handleDownload = async (r: ReportDef, format: 'xlsx' | 'csv') => {
    setDownloading(`${r.key}-${format}`);
    try {
      await downloadReport(
        r.key,
        format,
        r.supportsPeriod ? period : undefined,
        canDeptFilter && r.supportsDeptFilter
          ? { departmentId: deptFilter || undefined, deptHeadId: headFilter || undefined, ownerId: ownerFilter || undefined }
          : undefined
      );
    } catch {
      // A failed blob download surfaces as a generic error; keep it quiet but reset state.
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader
        title="Reports"
        subtitle={
          isOwner
            ? 'Export reports for the heads you oversee.'
            : isHead
            ? 'Export reports for your department head-slice.'
            : 'Export company-wide financial reports to Excel or CSV.'
        }
      />

      <div className="card mb-6 flex flex-wrap items-center gap-x-5 gap-y-3 p-4">
        <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
          Period
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="input w-52">
            <option value="monthly">Monthly (this month)</option>
            <option value="quarterly">Quarterly (this quarter)</option>
            <option value="yearly">Yearly (this financial year)</option>
          </select>
        </label>
        {canDeptFilter && (
          <>
            <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
              Department
              <select
                value={deptFilter}
                onChange={(e) => {
                  setDeptFilter(e.target.value);
                  // A head belongs to one department; changing it resets the head filter.
                  setHeadFilter('');
                  // Department and owner filters are mutually exclusive.
                  if (e.target.value) setOwnerFilter('');
                }}
                className="input w-52"
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
              Head
              <select
                value={headFilter}
                onChange={(e) => setHeadFilter(e.target.value)}
                className="input w-44"
                disabled={!deptFilter || headChoices.length === 0}
              >
                <option value="">All heads</option>
                {headChoices.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </label>
            {owners.length > 0 && (
              <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
                Owner
                <select
                  value={ownerFilter}
                  onChange={(e) => {
                    setOwnerFilter(e.target.value);
                    // Owner portfolio spans departments, so it clears dept/head.
                    if (e.target.value) {
                      setDeptFilter('');
                      setHeadFilter('');
                    }
                  }}
                  className="input w-44"
                >
                  <option value="">All owners</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        <span className="text-xs text-slate-400">
          Period applies to "period-aware" reports{canDeptFilter ? `; department/head${isAdmin ? '/owner' : ''} to "dept-filterable" ones` : ''}.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {reports.map((r) => (
          <div key={r.key} className="card flex flex-col p-5 transition-shadow hover:shadow-pop">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <r.icon size={17} />
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {r.supportsPeriod && (
                  <span className="badge bg-slate-100 text-slate-500">
                    <CalendarRange size={11} />
                    period-aware
                  </span>
                )}
                {canDeptFilter && r.supportsDeptFilter && (
                  <span className="badge bg-slate-100 text-slate-500">
                    <Building2 size={11} />
                    dept-filterable
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-900">{r.label}</p>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-500">{r.description}</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => handleDownload(r, 'xlsx')}
                disabled={downloading === `${r.key}-xlsx`}
                className="btn-secondary btn-sm"
              >
                {downloading === `${r.key}-xlsx` ? <LoaderCircle size={13} className="animate-spin" /> : <FileSpreadsheet size={13} className="text-emerald-600" />}
                {downloading === `${r.key}-xlsx` ? 'Exporting...' : 'Excel'}
              </button>
              <button
                onClick={() => handleDownload(r, 'csv')}
                disabled={downloading === `${r.key}-csv`}
                className="btn-secondary btn-sm"
              >
                {downloading === `${r.key}-csv` ? <LoaderCircle size={13} className="animate-spin" /> : <FileText size={13} className="text-slate-400" />}
                {downloading === `${r.key}-csv` ? 'Exporting...' : 'CSV'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
