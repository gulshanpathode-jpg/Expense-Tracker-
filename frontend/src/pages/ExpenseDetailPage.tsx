import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Paperclip, Trash2, LoaderCircle, Pencil, SendHorizonal } from 'lucide-react';
import { api, openProtectedFile } from '../api/client';
import type { Expense } from '../api/types';
import { useAuthStore } from '../store/authStore';
import { Avatar, Modal } from '../components/ui';
import { formatDate, money, titleCase } from '../lib/format';

export default function ExpenseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [acting, setActing] = useState(false);

  function load() {
    setLoading(true);
    api
      .get(`/expenses/${id}`)
      .then((res) => setExpense(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  // Admins can delete any expense; department heads can delete within their own
  // head-slice. Editing is for the owner or an admin.
  const headOwns =
    user?.role === 'DEPARTMENT_HEAD' &&
    (user.deptHeadId
      ? expense?.deptHeadId === user.deptHeadId
      : !!user.departmentId && expense?.departmentId === user.departmentId);
  const canDelete = !!expense && (user?.role === 'ADMIN' || !!headOwns);
  const canEdit = expense && (expense.userId === user?.id || user?.role === 'ADMIN');
  const isDraft = expense?.status === 'DRAFT';

  async function deleteExpense() {
    setActing(true);
    try {
      await api.delete(`/expenses/${id}`);
      toast.success('Expense deleted');
      navigate('/expenses');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Failed to delete');
      setActing(false);
      setShowDelete(false);
    }
  }

  async function submitDraft() {
    setActing(true);
    try {
      await api.put(`/expenses/${id}`, { status: 'SUBMITTED' });
      toast.success('Draft submitted');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Failed to submit — open Edit to complete missing details');
    } finally {
      setActing(false);
    }
  }

  if (loading)
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="card p-6">
          <div className="skeleton mb-3 h-6 w-64" />
          <div className="skeleton mb-6 h-4 w-40" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="skeleton mb-1.5 h-3 w-24" />
                <div className="skeleton h-4 w-36" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  if (!expense) return <div className="p-6 text-sm text-slate-500">Expense not found.</div>;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <button
        onClick={() => navigate('/expenses')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft size={15} />
        Back to expenses
      </button>

      <div className="card mb-6 overflow-hidden">
        {/* Hero */}
        <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm text-slate-500">
                {expense.vendor?.name ?? 'Expense'}
                {isDraft && <span className="badge bg-amber-50 text-amber-700">Draft</span>}
              </p>
              <p className="num mt-0.5 text-3xl font-semibold tracking-tight text-slate-900">{money(expense.amount, 'INR', 2)}</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
                {expense.user?.name && <Avatar name={expense.user.name} size="sm" />}
                {isDraft ? 'Drafted' : 'Submitted'} by {expense.user?.name ?? '-'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && isDraft && (
                <button onClick={submitDraft} disabled={acting} className="btn-primary btn-sm">
                  {acting ? <LoaderCircle size={13} className="animate-spin" /> : <SendHorizonal size={13} />}
                  Submit
                </button>
              )}
              {canEdit && (
                <button onClick={() => navigate(`/expenses/${expense.id}/edit`)} className="btn-secondary btn-sm">
                  <Pencil size={13} />
                  Edit
                </button>
              )}
              {canDelete && (
                <button onClick={() => setShowDelete(true)} className="btn-danger-soft btn-sm">
                  <Trash2 size={13} />
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 text-sm sm:grid-cols-3">
            <Detail label="Date" value={formatDate(expense.invoiceDate)} />
            <Detail label="Department" value={expense.department?.name ?? '-'} />
            <Detail label="Department Head" value={expense.deptHead?.name ?? '-'} />
            <Detail label="Category" value={expense.category?.label ?? '-'} />
            <Detail label="Payment Method" value={titleCase(expense.paymentMode)} />
            <Detail label="Invoice Number" value={expense.invoiceNo ?? '-'} />
            <Detail label="GST Amount" value={expense.gstAmount ? money(expense.gstAmount, 'INR', 2) : '-'} />
          </div>

          {expense.paymentDetails && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">Payment Details</p>
              <p className="text-sm text-slate-700">{expense.paymentDetails}</p>
            </div>
          )}

          {expense.description && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">Description</p>
              <p className="text-sm text-slate-700">{expense.description}</p>
            </div>
          )}

          {expense.attachments.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Attachments</p>
              <div className="flex flex-wrap gap-2">
                {expense.attachments.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() =>
                      openProtectedFile(`/expenses/attachments/${a.id}`).catch(() =>
                        toast.error('Could not open the attachment'),
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                  >
                    <Paperclip size={12} className="text-slate-400" />
                    {a.fileName}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={showDelete}
        onClose={() => !acting && setShowDelete(false)}
        title="Delete expense"
        footer={
          <>
            <button onClick={() => setShowDelete(false)} disabled={acting} className="btn-secondary btn-sm">
              Cancel
            </button>
            <button onClick={deleteExpense} disabled={acting} className="btn-danger btn-sm">
              {acting && <LoaderCircle size={13} className="animate-spin" />}
              Delete Expense
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This will permanently remove the expense of{' '}
          <span className="num font-semibold">{money(expense.amount, 'INR', 2)}</span>
          {expense.vendor?.name ? ` from ${expense.vendor.name}` : ''} and its attachments. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">{label}</p>
      <p className="mt-1 font-medium text-slate-800">{value}</p>
    </div>
  );
}
