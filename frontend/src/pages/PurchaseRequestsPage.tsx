import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, X, Package, LoaderCircle, FileOutput } from 'lucide-react';
import { api } from '../api/client';
import type { CostCenter, Department, PurchaseRequest } from '../api/types';
import { useAuthStore } from '../store/authStore';
import StatusBadge from '../components/StatusBadge';
import { EmptyState, Field, PageHeader, SkeletonRows } from '../components/ui';
import { money } from '../lib/format';

const canCreate = (role?: string) => role !== 'ACCOUNTS';

export default function PurchaseRequestsPage() {
  const user = useAuthStore((s) => s.user);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);

  const [title, setTitle] = useState('');
  const [justification, setJustification] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [estimatedAmount, setEstimatedAmount] = useState('');
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
      .get('/purchases/requests')
      .then((res) => setRequests(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/departments').then((res) => setDepartments(res.data));
    api.get('/cost-centers').then((res) => setCostCenters(res.data));
  }, []);

  const resetForm = () => {
    setTitle('');
    setJustification('');
    setDepartmentId('');
    setCostCenterId('');
    setEstimatedAmount('');
    setErrors({});
  };

  const handleCreate = async () => {
    const found: Record<string, string> = {};
    if (!title.trim()) found.title = 'Enter a title';
    if (!estimatedAmount) found.estimatedAmount = 'Enter an estimated amount';
    else if (Number(estimatedAmount) <= 0) found.estimatedAmount = 'Amount must be greater than 0';
    if (!departmentId && !user?.departmentId) found.departmentId = 'Select a department';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await api.post('/purchases/requests', {
        title,
        justification: justification || undefined,
        departmentId: departmentId || undefined,
        costCenterId: costCenterId || undefined,
        estimatedAmount: Number(estimatedAmount),
      });
      toast.success('Purchase request created as draft');
      resetForm();
      setShowForm(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to create purchase request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitRequest = async (id: string) => {
    try {
      await api.post(`/purchases/requests/${id}/submit`);
      toast.success('Purchase request submitted for approval');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to submit');
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Purchase Requests"
        subtitle="Request new purchases before a PO is issued."
        actions={
          <>
            <Link to="/purchases/orders" className="btn-secondary">
              <FileOutput size={15} />
              Purchase Orders
            </Link>
            {canCreate(user?.role) && (
              <button onClick={() => setShowForm((v) => !v)} className={showForm ? 'btn-secondary' : 'btn-primary'}>
                {showForm ? <X size={15} /> : <Plus size={15} />}
                {showForm ? 'Cancel' : 'New Request'}
              </button>
            )}
          </>
        }
      />

      {showForm && (
        <div className="card mb-6 p-5">
          <h2 className="card-title mb-4">New Purchase Request</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Title" required error={errors.title}>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  clearError('title');
                }}
                aria-invalid={!!errors.title}
                className="input"
                placeholder="e.g. New laptops for design team"
              />
            </Field>
            <Field label="Estimated Amount" required error={errors.estimatedAmount}>
              <input
                type="number"
                min={0}
                value={estimatedAmount}
                onChange={(e) => {
                  setEstimatedAmount(e.target.value);
                  clearError('estimatedAmount');
                }}
                aria-invalid={!!errors.estimatedAmount}
                className="input"
                placeholder="0"
              />
            </Field>
            <Field label="Department" required={!user?.departmentId} error={errors.departmentId}>
              <select
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  clearError('departmentId');
                }}
                aria-invalid={!!errors.departmentId}
                className="input"
              >
                <option value="">{user?.departmentId ? 'My department' : 'Select department'}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code ? `${d.code} - ${d.name}` : d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cost Center">
              <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} className="input">
                <option value="">None</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Justification">
                <textarea value={justification} onChange={(e) => setJustification(e.target.value)} className="input" rows={2} placeholder="Why is this purchase needed?" />
              </Field>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={handleCreate} disabled={submitting} className="btn-primary">
              {submitting && <LoaderCircle size={15} className="animate-spin" />}
              {submitting ? 'Creating...' : 'Create Draft'}
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
                <div className="skeleton mb-2 h-4 w-48" />
                <div className="skeleton h-3 w-32" />
              </div>
            ))}
          {!loading &&
            requests.map((r) => (
              <div key={r.id} className="p-4">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <StatusBadge status={r.status} />
                  <span className="num font-semibold text-slate-900">{money(r.estimatedAmount)}</span>
                </div>
                <Link to={`/purchases/requests/${r.id}`} className="font-medium text-brand-600 hover:underline">
                  {r.title}
                </Link>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {r.department.name} · {r.requestedBy.name}
                </p>
                {r.status === 'DRAFT' && r.requestedBy.id === user?.id && (
                  <button onClick={() => handleSubmitRequest(r.id)} className="btn-secondary btn-sm mt-2.5">
                    Submit
                  </button>
                )}
              </div>
            ))}
        </div>

        {/* Desktop: table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/80">
              <tr>
                <th className="th">Title</th>
                <th className="th">Department</th>
                <th className="th">Requested By</th>
                <th className="th text-right">Estimated Amount</th>
                <th className="th">Status</th>
                <th className="th text-right"></th>
              </tr>
            </thead>
            {loading ? (
              <SkeletonRows cols={6} rows={5} />
            ) : (
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="td">
                      <Link to={`/purchases/requests/${r.id}`} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
                        {r.title}
                      </Link>
                    </td>
                    <td className="td">{r.department.code ? `${r.department.code} - ${r.department.name}` : r.department.name}</td>
                    <td className="td">{r.requestedBy.name}</td>
                    <td className="td num text-right font-semibold text-slate-900">{money(r.estimatedAmount)}</td>
                    <td className="td">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="td text-right">
                      {r.status === 'DRAFT' && r.requestedBy.id === user?.id && (
                        <button onClick={() => handleSubmitRequest(r.id)} className="btn-secondary btn-sm">
                          Submit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        {!loading && requests.length === 0 && (
          <EmptyState icon={<Package size={20} />} title="No purchase requests yet" hint="Create a request to kick off the procurement flow." />
        )}
      </div>
    </div>
  );
}
