import { Fragment, useEffect, useState } from 'react';
import { ScrollText, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api/client';
import type { AuditLog } from '../api/types';
import { EmptyState, FilterField, PageHeader, SkeletonRows } from '../components/ui';
import { formatDateTime } from '../lib/format';

const ACTION_COLOR: Record<string, string> = {
  CREATE: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
  UPDATE: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/20',
  DELETE: 'bg-red-50 text-red-700 ring-1 ring-red-600/20',
  APPROVE: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
  REJECT: 'bg-red-50 text-red-700 ring-1 ring-red-600/20',
  SUBMIT: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20',
  REVISE: 'bg-violet-50 text-violet-700 ring-1 ring-violet-600/20',
  ISSUE: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/20',
  DELIVERY: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
  MAP_INVOICE: 'bg-slate-100 text-slate-600',
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (entityType) params.entityType = entityType;
    if (action) params.action = action;
    api
      .get('/audit-logs', { params })
      .then((res) => setLogs(res.data))
      .finally(() => setLoading(false));
  }, [entityType, action]);

  const entityTypes = ['Expense', 'Budget', 'Department', 'Vendor', 'PurchaseRequest', 'PurchaseOrder'];
  const actions = ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'SUBMIT', 'REVISE', 'ISSUE', 'DELIVERY', 'MAP_INVOICE'];

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title="Audit Log" subtitle="Complete trail of create, update, approve, and delete actions." />

      <div className="card mb-4 flex flex-wrap gap-3 p-4">
        <FilterField label="Entity Type">
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="input w-44">
            <option value="">All</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Action">
          <select value={action} onChange={(e) => setAction(e.target.value)} className="input w-44">
            <option value="">All</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </FilterField>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/80">
              <tr>
                <th className="th">Timestamp</th>
                <th className="th">User</th>
                <th className="th">Action</th>
                <th className="th">Entity</th>
                <th className="th">IP</th>
                <th className="th"></th>
              </tr>
            </thead>
            {loading ? (
              <SkeletonRows cols={6} rows={8} />
            ) : (
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr className="transition-colors hover:bg-slate-50/70">
                      <td className="td num whitespace-nowrap text-slate-500">{formatDateTime(log.timestamp)}</td>
                      <td className="td font-medium text-slate-900">{log.user?.name ?? 'System'}</td>
                      <td className="td">
                        <span className={clsx('badge', ACTION_COLOR[log.action] ?? 'bg-slate-100 text-slate-600')}>{log.action}</span>
                      </td>
                      <td className="td">
                        {log.entityType}
                        {log.entityId && <span className="ml-1 font-mono text-xs text-slate-400">{log.entityId.slice(0, 8)}</span>}
                      </td>
                      <td className="td text-slate-400">{log.ip ?? '-'}</td>
                      <td className="td text-right">
                        {!!(log.oldValue || log.newValue) && (
                          <button
                            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                            className="btn-ghost btn-sm inline-flex items-center gap-1"
                          >
                            {expandedId === log.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            {expandedId === log.id ? 'Hide' : 'Details'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <tr>
                        <td colSpan={6} className="bg-slate-50/80 px-4 py-4">
                          <div className="grid grid-cols-1 gap-4 text-xs lg:grid-cols-2">
                            <div>
                              <p className="mb-1.5 font-semibold tracking-wide text-slate-500 uppercase">Before</p>
                              <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-700">
                                {JSON.stringify(log.oldValue, null, 2) ?? 'null'}
                              </pre>
                            </div>
                            <div>
                              <p className="mb-1.5 font-semibold tracking-wide text-slate-500 uppercase">After</p>
                              <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-700">
                                {JSON.stringify(log.newValue, null, 2) ?? 'null'}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            )}
          </table>
        </div>
        {!loading && logs.length === 0 && (
          <EmptyState icon={<ScrollText size={20} />} title="No audit entries found" hint="Try removing the entity or action filters." />
        )}
      </div>
    </div>
  );
}
