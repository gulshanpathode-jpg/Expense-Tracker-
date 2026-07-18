import { Fragment, useEffect, useState } from 'react';
import { ScrollText, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api/client';
import type { AuditLog } from '../api/types';
import { EmptyState, FilterField, PageHeader, SkeletonRows } from '../components/ui';
import { formatDateTime, formatDate, money, titleCase } from '../lib/format';

const ACTION_COLOR: Record<string, string> = {
  CREATE: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
  UPDATE: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/20',
  DELETE: 'bg-red-50 text-red-700 ring-1 ring-red-600/20',
  UPSERT: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/20',
  REVISE: 'bg-violet-50 text-violet-700 ring-1 ring-violet-600/20',
  RESET_PASSWORD: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20',
  APPROVE: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
  REJECT: 'bg-red-50 text-red-700 ring-1 ring-red-600/20',
  SUBMIT: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20',
  ISSUE: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/20',
  DELIVERY: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
  MAP_INVOICE: 'bg-slate-100 text-slate-600',
};

// ---- Human-readable rendering of audit records -----------------------------

// Fields that are noise in a diff (internal keys, timestamps, secrets, FK ids).
const HIDDEN_FIELDS = new Set([
  'id', 'createdAt', 'updatedAt', 'passwordHash', 'monthlyAmounts', 'currency',
  'attachments', 'revisions', 'userId', 'fyId', 'departmentId', 'deptHeadId',
  'categoryId', 'vendorId', 'managerId', 'parentId', 'invoiceExpenseId',
  'purchaseRequestId', 'approverId', 'requestedById', 'createdById', 'recordedById',
]);
const MONEY_FIELDS = new Set([
  'amount', 'gstAmount', 'annualAmount', 'budgetAmount', 'estimatedAmount',
  'estimatedUnitCost', 'deliveredAmount', 'oldAmount', 'newAmount', 'totalUtilized', 'totalRemaining',
]);
const DATE_FIELDS = new Set(['invoiceDate', 'issuedAt', 'approvedAt', 'deliveredAt', 'revisedAt', 'startDate', 'endDate']);
const CASE_FIELDS = new Set(['role', 'status', 'paymentMode']);

const FIELD_LABELS: Record<string, string> = {
  invoiceNo: 'Invoice No',
  gstAmount: 'GST Amount',
  paymentMode: 'Payment Method',
  paymentDetails: 'Payment Details',
  annualAmount: 'Annual Budget',
  budgetAmount: 'Budget',
  isActive: 'Active',
  poNumber: 'PO Number',
};

const ENTITY_NOUN: Record<string, string> = {
  Expense: 'expense',
  User: 'user',
  Department: 'department',
  DepartmentHead: 'department head',
  Budget: 'budget',
  Vendor: 'vendor',
  PurchaseRequest: 'purchase request',
  PurchaseOrder: 'purchase order',
  Category: 'category',
};

const ACTION_VERB: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  UPSERT: 'Saved',
  REVISE: 'Revised',
  RESET_PASSWORD: 'Reset password for',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  SUBMIT: 'Submitted',
  ISSUE: 'Issued',
  DELIVERY: 'Recorded delivery for',
  MAP_INVOICE: 'Mapped invoice for',
};

type Obj = Record<string, unknown> | null | undefined;

function prettyField(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const spaced = key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  return spaced.trim();
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (MONEY_FIELDS.has(key) && typeof value === 'number') return money(value);
  if (DATE_FIELDS.has(key) && typeof value === 'string') return formatDate(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (CASE_FIELDS.has(key) && typeof value === 'string') return titleCase(value);
  if (typeof value === 'object') {
    if (Array.isArray(value)) return `${value.length} item(s)`;
    return JSON.stringify(value);
  }
  return String(value);
}

// A short label naming the specific entity a log row is about.
function entityLabel(log: AuditLog): string {
  const v = (log.newValue ?? log.oldValue) as Obj;
  if (!v) return '';
  switch (log.entityType) {
    case 'Expense':
      return [typeof v.amount === 'number' ? money(v.amount) : '', v.description || v.invoiceNo || ''].filter(Boolean).join(' · ');
    case 'User':
      return [v.name, v.email ? `(${v.email})` : ''].filter(Boolean).join(' ');
    case 'Department':
    case 'DepartmentHead':
    case 'Vendor':
    case 'Category':
      return String(v.name ?? v.label ?? '');
    case 'Budget':
      return typeof v.annualAmount === 'number' ? money(v.annualAmount) : '';
    case 'PurchaseOrder':
      return String(v.poNumber ?? '');
    case 'PurchaseRequest':
      return String(v.title ?? '');
    default:
      return '';
  }
}

type Change = { field: string; before: string; after: string };

function diffChanges(oldV: Obj, newV: Obj): Change[] {
  const keys = new Set([...Object.keys(oldV ?? {}), ...Object.keys(newV ?? {})]);
  const changes: Change[] = [];
  for (const k of keys) {
    if (HIDDEN_FIELDS.has(k)) continue;
    const a = (oldV ?? {})[k];
    const b = (newV ?? {})[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    changes.push({ field: prettyField(k), before: formatValue(k, a), after: formatValue(k, b) });
  }
  return changes;
}

// Fields to list for a single-object snapshot (create/delete).
function snapshotRows(obj: Obj): Change[] {
  if (!obj) return [];
  return Object.keys(obj)
    .filter((k) => !HIDDEN_FIELDS.has(k) && obj[k] !== null && obj[k] !== undefined && obj[k] !== '')
    .map((k) => ({ field: prettyField(k), before: '', after: formatValue(k, obj[k]) }));
}

function describe(log: AuditLog): string {
  const verb = ACTION_VERB[log.action] ?? log.action;
  const noun = ENTITY_NOUN[log.entityType] ?? log.entityType.toLowerCase();
  const label = entityLabel(log);
  let s = `${verb} ${noun}${label ? ` ${label}` : ''}`;
  if (log.action === 'UPDATE') {
    const changes = diffChanges(log.oldValue as Obj, log.newValue as Obj);
    if (changes.length) {
      const shown = changes.slice(0, 3).map((c) => `${c.field}: ${c.before} → ${c.after}`).join(', ');
      s += ` — ${shown}${changes.length > 3 ? `, +${changes.length - 3} more` : ''}`;
    }
  }
  return s;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

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

  const entityTypes = ['Expense', 'Budget', 'Department', 'DepartmentHead', 'Vendor', 'User', 'PurchaseRequest', 'PurchaseOrder'];
  const actions = ['CREATE', 'UPDATE', 'DELETE', 'UPSERT', 'REVISE', 'RESET_PASSWORD', 'APPROVE', 'REJECT', 'SUBMIT', 'ISSUE', 'DELIVERY'];

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title="Audit Log" subtitle="Complete trail of every create, update, and delete action across the app." />

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
                {a.replace('_', ' ')}
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
                <th className="th whitespace-nowrap">When</th>
                <th className="th">User</th>
                <th className="th">Action</th>
                <th className="th">What happened</th>
                <th className="th">IP</th>
                <th className="th"></th>
              </tr>
            </thead>
            {loading ? (
              <SkeletonRows cols={6} rows={8} />
            ) : (
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const hasDetail = !!(log.oldValue || log.newValue);
                  const isOpen = expandedId === log.id;
                  return (
                    <Fragment key={log.id}>
                      <tr className="align-top transition-colors hover:bg-slate-50/70">
                        <td className="td num whitespace-nowrap text-slate-500">{formatDateTime(log.timestamp)}</td>
                        <td className="td whitespace-nowrap font-medium text-slate-900">{log.user?.name ?? 'System'}</td>
                        <td className="td">
                          <span className={clsx('badge whitespace-nowrap', ACTION_COLOR[log.action] ?? 'bg-slate-100 text-slate-600')}>
                            {log.action.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="td text-slate-700">
                          {describe(log)}
                          {log.entityId && <span className="ml-1.5 font-mono text-[10px] text-slate-300">#{log.entityId.slice(0, 8)}</span>}
                        </td>
                        <td className="td whitespace-nowrap text-slate-400">{log.ip ?? '-'}</td>
                        <td className="td text-right">
                          {hasDetail && (
                            <button
                              onClick={() => {
                                setExpandedId(isOpen ? null : log.id);
                                setShowRaw(false);
                              }}
                              className="btn-ghost btn-sm inline-flex items-center gap-1"
                            >
                              {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              {isOpen ? 'Hide' : 'Details'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && hasDetail && (
                        <tr>
                          <td colSpan={6} className="bg-slate-50/80 px-4 py-4">
                            <AuditDetail log={log} showRaw={showRaw} onToggleRaw={() => setShowRaw((v) => !v)} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
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

function AuditDetail({ log, showRaw, onToggleRaw }: { log: AuditLog; showRaw: boolean; onToggleRaw: () => void }) {
  const isUpdate = log.action === 'UPDATE' || log.action === 'REVISE' || log.action === 'UPSERT';
  const rows: Change[] = isUpdate && log.oldValue
    ? diffChanges(log.oldValue as Obj, log.newValue as Obj)
    : snapshotRows((log.newValue ?? log.oldValue) as Obj);
  const isSnapshot = !(isUpdate && log.oldValue);
  const snapshotTitle = log.action === 'DELETE' ? 'Deleted record' : 'Details';

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {isSnapshot ? snapshotTitle : 'Changes'}
        </p>
        <button onClick={onToggleRaw} className="text-[11px] font-medium text-brand-600 hover:underline">
          {showRaw ? 'Hide raw data' : 'Show raw data'}
        </button>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Field</th>
                {!isSnapshot && <th className="px-3 py-1.5 text-left font-medium">Before</th>}
                <th className="px-3 py-1.5 text-left font-medium">{isSnapshot ? 'Value' : 'After'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.field}>
                  <td className="px-3 py-1.5 font-medium text-slate-600">{c.field}</td>
                  {!isSnapshot && <td className="px-3 py-1.5 text-slate-400 line-through">{c.before}</td>}
                  <td className="px-3 py-1.5 text-slate-800">{c.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-slate-400">No field-level detail recorded for this action.</p>
      )}

      {showRaw && (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Before (raw)</p>
            <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-600">
              {JSON.stringify(log.oldValue ?? null, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">After (raw)</p>
            <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-600">
              {JSON.stringify(log.newValue ?? null, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
