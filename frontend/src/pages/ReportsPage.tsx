import { useState } from 'react';
import {
  Building2,
  Wallet,
  Store,
  Users,
  Percent,
  CalendarRange,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui';

type ReportDef = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  supportsPeriod?: boolean;
};

const REPORTS: ReportDef[] = [
  {
    key: 'department-wise',
    label: 'Department-wise Expense Report',
    description: 'All recorded expenses grouped by department.',
    icon: Building2,
    supportsPeriod: true,
  },
  {
    key: 'budget-utilization',
    label: 'Budget Utilization Report',
    description: 'Allocated vs spent vs remaining per department.',
    icon: Wallet,
  },
  {
    key: 'category-wise',
    label: 'Category Budget Report',
    description: 'Budget vs spend per category.',
    icon: Users,
  },
  {
    key: 'vendor-spend',
    label: 'Vendor Spending Report',
    description: 'Total spend and expense count per vendor.',
    icon: Store,
  },
  {
    key: 'gst',
    label: 'GST Report',
    description: 'Expenses with GST amounts and vendor GST numbers.',
    icon: Percent,
    supportsPeriod: true,
  },
  {
    key: 'period-summary',
    label: 'Monthly / Quarterly / Yearly Report',
    description: 'Department spend summary for the selected period.',
    icon: CalendarRange,
    supportsPeriod: true,
  },
];

async function downloadReport(key: string, format: 'xlsx' | 'csv', period?: string) {
  const params: Record<string, string> = { format };
  if (period) params.period = period;
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
  const [period, setPeriod] = useState('monthly');
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = async (key: string, format: 'xlsx' | 'csv', supportsPeriod?: boolean) => {
    setDownloading(`${key}-${format}`);
    try {
      await downloadReport(key, format, supportsPeriod ? period : undefined);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader title="Reports" subtitle="Export financial reports to Excel or CSV." />

      <div className="card mb-6 flex flex-wrap items-center gap-3 p-4">
        <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
          Period
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="input w-52">
            <option value="monthly">Monthly (this month)</option>
            <option value="quarterly">Quarterly (this quarter)</option>
            <option value="yearly">Yearly (this year)</option>
          </select>
        </label>
        <span className="text-xs text-slate-400">Applies to reports marked "period-aware".</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <div key={r.key} className="card flex flex-col p-5 transition-shadow hover:shadow-pop">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <r.icon size={17} />
              </div>
              {r.supportsPeriod && (
                <span className="badge bg-slate-100 text-slate-500">
                  <CalendarRange size={11} />
                  period-aware
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-900">{r.label}</p>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-500">{r.description}</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => handleDownload(r.key, 'xlsx', r.supportsPeriod)}
                disabled={downloading === `${r.key}-xlsx`}
                className="btn-secondary btn-sm"
              >
                {downloading === `${r.key}-xlsx` ? <LoaderCircle size={13} className="animate-spin" /> : <FileSpreadsheet size={13} className="text-emerald-600" />}
                {downloading === `${r.key}-xlsx` ? 'Exporting...' : 'Excel'}
              </button>
              <button
                onClick={() => handleDownload(r.key, 'csv', r.supportsPeriod)}
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
