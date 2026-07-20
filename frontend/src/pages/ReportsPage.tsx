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
  deptFilter?: { departmentId?: string; deptHeadId?: string }
) {
  const params: Record<string, string> = { format };
  if (period) params.period = period;
  if (deptFilter?.departmentId) params.departmentId = deptFilter.departmentId;
  if (deptFilter?.deptHeadId) params.deptHeadId = deptFilter.deptHeadId;
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
  const reports = isHead ? HEAD_REPORTS : ADMIN_REPORTS;

  const [period, setPeriod] = useState('monthly');
  const [downloading, setDownloading] = useState<string | null>(null);

  // Admin-only department/head filter for department-based reports.
  const isAdmin = user?.role === 'ADMIN';
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptFilter, setDeptFilter] = useState(''); // '' = all departments
  const [headFilter, setHeadFilter] = useState(''); // '' = all heads

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/departments').then((res) => setDepartments(res.data.filter((d: Department) => d.isActive)));
  }, [isAdmin]);

  const filterDept = departments.find((d) => d.id === deptFilter);
  const headChoices = filterDept?.heads ?? [];

  const handleDownload = async (r: ReportDef, format: 'xlsx' | 'csv') => {
    setDownloading(`${r.key}-${format}`);
    try {
      await downloadReport(
        r.key,
        format,
        r.supportsPeriod ? period : undefined,
        isAdmin && r.supportsDeptFilter
          ? { departmentId: deptFilter || undefined, deptHeadId: headFilter || undefined }
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
        subtitle={isHead ? 'Export reports for your department head-slice.' : 'Export company-wide financial reports to Excel or CSV.'}
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
        {isAdmin && (
          <>
            <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
              Department
              <select
                value={deptFilter}
                onChange={(e) => {
                  setDeptFilter(e.target.value);
                  // A head belongs to one department; changing it resets the head filter.
                  setHeadFilter('');
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
          </>
        )}
        <span className="text-xs text-slate-400">
          Period applies to "period-aware" reports{isAdmin ? '; department/head to "dept-filterable" ones' : ''}.
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
                {isAdmin && r.supportsDeptFilter && (
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
