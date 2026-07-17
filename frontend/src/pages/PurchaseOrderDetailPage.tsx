import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, FileText, Truck, Link2, Send, LoaderCircle, Search } from 'lucide-react';
import { api, openProtectedFile } from '../api/client';
import type { Expense, PurchaseOrder } from '../api/types';
import { useAuthStore } from '../store/authStore';
import StatusBadge from '../components/StatusBadge';
import { Field } from '../components/ui';
import { formatDate, money } from '../lib/format';

// ACCOUNTS is read-only per spec; only admins manage the PO lifecycle.
const canManage = (role?: string) => role === 'ADMIN';

export default function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [deliveredAmount, setDeliveredAmount] = useState('');
  const [deliveryError, setDeliveryError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseResults, setExpenseResults] = useState<Expense[]>([]);

  const load = () => {
    api.get(`/purchases/orders/${id}`).then((res) => setOrder(res.data));
  };

  useEffect(load, [id]);

  const issue = async () => {
    setBusy(true);
    try {
      await api.post(`/purchases/orders/${id}/issue`);
      toast.success('Purchase order issued');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to issue order');
    } finally {
      setBusy(false);
    }
  };

  const recordDelivery = async () => {
    if (!deliveredAmount) {
      setDeliveryError('Enter a delivered amount');
      return;
    }
    if (Number(deliveredAmount) <= 0) {
      setDeliveryError('Amount must be greater than 0');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/purchases/orders/${id}/deliveries`, { deliveredAmount: Number(deliveredAmount), note: note || undefined });
      toast.success('Delivery recorded');
      setDeliveredAmount('');
      setNote('');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to record delivery');
    } finally {
      setBusy(false);
    }
  };

  const searchExpenses = async (q: string) => {
    setExpenseSearch(q);
    if (q.length < 2) return setExpenseResults([]);
    const res = await api.get('/expenses', { params: { q } });
    setExpenseResults(res.data.slice(0, 8));
  };

  const mapInvoice = async (expenseId: string) => {
    setBusy(true);
    try {
      await api.post(`/purchases/orders/${id}/map-invoice`, { expenseId });
      toast.success('Invoice mapped to purchase order');
      setExpenseResults([]);
      setExpenseSearch('');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to map invoice');
    } finally {
      setBusy(false);
    }
  };

  if (!order)
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="card p-6">
          <div className="skeleton mb-3 h-6 w-56" />
          <div className="skeleton mb-6 h-4 w-40" />
          <div className="skeleton h-20 w-full" />
        </div>
      </div>
    );

  const totalDelivered = order.deliveries.reduce((s, d) => s + d.deliveredAmount, 0);
  const deliveredPct = order.amount > 0 ? Math.min(100, (totalDelivered / order.amount) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <button
        onClick={() => navigate('/purchases/orders')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft size={15} />
        Back to Purchase Orders
      </button>

      <div className="card mb-6 p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="num text-xl font-semibold tracking-tight text-slate-900">{order.poNumber}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {order.vendor.name} · {order.department.name}
            </p>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">PO Amount</p>
            <p className="num mt-1 text-lg font-semibold text-slate-900">{money(order.amount)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Delivered So Far</p>
            <p className="num mt-1 text-lg font-semibold text-slate-900">{money(totalDelivered)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Created By</p>
            <p className="mt-1 font-medium text-slate-800">{order.createdBy.name}</p>
          </div>
        </div>

        {/* Delivery progress */}
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>Delivery progress</span>
          <span className="num">{deliveredPct.toFixed(0)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${deliveredPct}%` }} />
        </div>

        {order.quotationFilePath && (
          <button
            type="button"
            onClick={() =>
              openProtectedFile(`/purchases/orders/${order.id}/quotation`).catch(() =>
                toast.error('Could not open the quotation'),
              )
            }
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            <FileText size={12} className="text-slate-400" />
            View attached quotation ({order.quotationFileName})
          </button>
        )}

        {canManage(user?.role) && order.status === 'DRAFT' && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <button onClick={issue} disabled={busy} className="btn-primary">
              {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
              Issue Purchase Order
            </button>
          </div>
        )}
      </div>

      {canManage(user?.role) && ['ISSUED', 'PARTIALLY_DELIVERED'].includes(order.status) && (
        <div className="card mb-6 p-6">
          <h2 className="card-title mb-4 flex items-center gap-2">
            <Truck size={15} className="text-slate-400" />
            Record Delivery
          </h2>
          <div className="flex flex-wrap items-start gap-3">
            <Field label="Delivered Amount" className="w-40" error={deliveryError}>
              <input
                type="number"
                min={0}
                value={deliveredAmount}
                onChange={(e) => {
                  setDeliveredAmount(e.target.value);
                  if (deliveryError) setDeliveryError('');
                }}
                aria-invalid={!!deliveryError}
                className="input"
                placeholder="0"
              />
            </Field>
            <Field label="Note" className="min-w-40 flex-1">
              <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Optional" />
            </Field>
            <button onClick={recordDelivery} disabled={busy} className="btn-primary mt-[26px]">
              Record
            </button>
          </div>
        </div>
      )}

      {order.deliveries.length > 0 && (
        <div className="card mb-6 p-6">
          <h2 className="card-title mb-3">Delivery History</h2>
          <ul className="divide-y divide-slate-100">
            {order.deliveries.map((d) => (
              <li key={d.id} className="flex justify-between py-2.5 text-sm">
                <span className="text-slate-700">
                  <span className="num font-medium">{money(d.deliveredAmount)}</span>
                  {d.note && <span className="text-slate-400"> · {d.note}</span>}
                </span>
                <span className="text-slate-400">
                  {formatDate(d.deliveredAt)} · {d.recordedBy.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-6">
        <h2 className="card-title mb-3 flex items-center gap-2">
          <Link2 size={15} className="text-slate-400" />
          Invoice Mapping
        </h2>
        {order.invoiceExpense ? (
          <p className="text-sm text-slate-700">
            Mapped to invoice <span className="font-medium">{order.invoiceExpense.invoiceNo ?? order.invoiceExpense.id.slice(0, 8)}</span> for{' '}
            <span className="num font-medium">{money(order.invoiceExpense.amount)}</span>
          </p>
        ) : canManage(user?.role) ? (
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              value={expenseSearch}
              onChange={(e) => searchExpenses(e.target.value)}
              placeholder="Search expenses by invoice #, vendor..."
              className="input pl-9"
            />
            {expenseResults.length > 0 && (
              <div className="absolute z-10 mt-1.5 w-full overflow-hidden rounded-lg bg-white shadow-pop ring-1 ring-slate-900/5">
                {expenseResults.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => mapInvoice(e.id)}
                    disabled={busy}
                    className="w-full border-b border-slate-50 px-3.5 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{e.invoiceNo ?? e.id.slice(0, 8)}</span>
                    <span className="text-slate-500">
                      {' '}
                      · {e.vendor?.name ?? 'Unknown vendor'} · <span className="num">{money(e.amount)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No invoice mapped yet.</p>
        )}
      </div>
    </div>
  );
}
