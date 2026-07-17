import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, X, FileOutput, ClipboardList, LoaderCircle, Link2 } from 'lucide-react';
import { api } from '../api/client';
import type { Department, PurchaseOrder, Vendor } from '../api/types';
import { useAuthStore } from '../store/authStore';
import StatusBadge from '../components/StatusBadge';
import { EmptyState, Field, PageHeader, SkeletonRows } from '../components/ui';
import { money } from '../lib/format';

// ACCOUNTS is read-only per spec; only admins manage the PO lifecycle.
const canManage = (role?: string) => role === 'ADMIN';

export default function PurchaseOrdersPage() {
  const user = useAuthStore((s) => s.user);
  const [searchParams] = useSearchParams();
  const fromRequest = searchParams.get('fromRequest');

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(!!fromRequest);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [vendorId, setVendorId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [amount, setAmount] = useState('');
  const [quotation, setQuotation] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });

  const load = () => {
    setLoading(true);
    api
      .get('/purchases/orders')
      .then((res) => setOrders(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/vendors').then((res) => setVendors(res.data));
    api.get('/departments').then((res) => setDepartments(res.data));
  }, []);

  const handleCreate = async () => {
    const found: Record<string, string> = {};
    if (!vendorId) found.vendorId = 'Select a vendor';
    if (!departmentId) found.departmentId = 'Select a department';
    if (!amount) found.amount = 'Enter an amount';
    else if (Number(amount) <= 0) found.amount = 'Amount must be greater than 0';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('vendorId', vendorId);
      fd.append('departmentId', departmentId);
      fd.append('amount', amount);
      if (fromRequest) fd.append('purchaseRequestId', fromRequest);
      if (quotation) fd.append('quotation', quotation);
      await api.post('/purchases/orders', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Purchase order created as draft');
      setVendorId('');
      setDepartmentId('');
      setAmount('');
      setQuotation(null);
      setErrors({});
      setShowForm(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to create purchase order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Purchase Orders"
        subtitle="Issue POs, attach quotations, and track deliveries."
        actions={
          <>
            <Link to="/purchases" className="btn-secondary">
              <ClipboardList size={15} />
              Purchase Requests
            </Link>
            {canManage(user?.role) && (
              <button onClick={() => setShowForm((v) => !v)} className={showForm ? 'btn-secondary' : 'btn-primary'}>
                {showForm ? <X size={15} /> : <Plus size={15} />}
                {showForm ? 'Cancel' : 'New Purchase Order'}
              </button>
            )}
          </>
        }
      />

      {showForm && (
        <div className="card mb-6 p-5">
          <h2 className="card-title mb-1">New Purchase Order</h2>
          {fromRequest && (
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-brand-600">
              <Link2 size={13} />
              Linked to purchase request {fromRequest.slice(0, 8)}
            </p>
          )}
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Vendor" required error={errors.vendorId}>
              <select
                value={vendorId}
                onChange={(e) => {
                  setVendorId(e.target.value);
                  clearError('vendorId');
                }}
                aria-invalid={!!errors.vendorId}
                className="input"
              >
                <option value="">Select vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Department" required error={errors.departmentId}>
              <select
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  clearError('departmentId');
                }}
                aria-invalid={!!errors.departmentId}
                className="input"
              >
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code ? `${d.code} - ${d.name}` : d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount" required error={errors.amount}>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  clearError('amount');
                }}
                aria-invalid={!!errors.amount}
                className="input"
                placeholder="0"
              />
            </Field>
            <Field label="Quotation (PDF/JPG)">
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/jpg,image/png"
                onChange={(e) => setQuotation(e.target.files?.[0] ?? null)}
                className="input file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-medium file:text-brand-700"
              />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={handleCreate} disabled={submitting} className="btn-primary">
              {submitting && <LoaderCircle size={15} className="animate-spin" />}
              {submitting ? 'Creating...' : 'Create Draft PO'}
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {/* Mobile: stacked cards */}
        <div className="divide-y divide-slate-100 md:hidden">
          {loading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4">
                <div className="skeleton mb-2 h-4 w-40" />
                <div className="skeleton h-3 w-28" />
              </div>
            ))}
          {!loading &&
            orders.map((o) => (
              <Link key={o.id} to={`/purchases/orders/${o.id}`} className="block p-4 transition-colors active:bg-slate-50">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="num font-medium text-brand-600">{o.poNumber}</span>
                  <StatusBadge status={o.status} />
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm text-slate-700">{o.vendor.name}</p>
                  <p className="num shrink-0 font-semibold text-slate-900">{money(o.amount)}</p>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">{o.department.name}</p>
              </Link>
            ))}
        </div>

        {/* Desktop: table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/80">
              <tr>
                <th className="th">PO Number</th>
                <th className="th">Vendor</th>
                <th className="th">Department</th>
                <th className="th text-right">Amount</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            {loading ? (
              <SkeletonRows cols={5} rows={5} />
            ) : (
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="td num">
                      <Link to={`/purchases/orders/${o.id}`} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
                        {o.poNumber}
                      </Link>
                    </td>
                    <td className="td font-medium text-slate-900">{o.vendor.name}</td>
                    <td className="td">{o.department.code ? `${o.department.code} - ${o.department.name}` : o.department.name}</td>
                    <td className="td num text-right font-semibold text-slate-900">{money(o.amount)}</td>
                    <td className="td">
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        {!loading && orders.length === 0 && (
          <EmptyState icon={<FileOutput size={20} />} title="No purchase orders yet" hint="Approve a purchase request, then issue a PO from it." />
        )}
      </div>
    </div>
  );
}
