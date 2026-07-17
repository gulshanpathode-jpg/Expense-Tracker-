import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, X, LoaderCircle, MessageSquareQuote } from 'lucide-react';
import { api } from '../api/client';
import type { PurchaseRequest } from '../api/types';
import { useAuthStore } from '../store/authStore';
import StatusBadge from '../components/StatusBadge';
import { FieldError } from '../components/ui';
import { money } from '../lib/format';

const canApprove = (role?: string) => role === 'DEPARTMENT_HEAD' || role === 'ADMIN';

export default function PurchaseRequestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [request, setRequest] = useState<PurchaseRequest | null>(null);
  const [comments, setComments] = useState('');
  const [commentError, setCommentError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get(`/purchases/requests/${id}`).then((res) => setRequest(res.data));
  };

  useEffect(load, [id]);

  const act = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !comments.trim()) {
      setCommentError('Please give a reason for rejection');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/purchases/requests/${id}/${action}`, { comments: comments || undefined });
      toast.success(action === 'approve' ? 'Request approved' : 'Request rejected');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (!request)
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="card p-6">
          <div className="skeleton mb-3 h-6 w-72" />
          <div className="skeleton mb-6 h-4 w-48" />
          <div className="skeleton h-24 w-full" />
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl p-6">
      <button
        onClick={() => navigate('/purchases')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft size={15} />
        Back to Purchase Requests
      </button>

      <div className="card mb-6 p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">{request.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {request.department.name} · Requested by {request.requestedBy.name}
            </p>
          </div>
          <StatusBadge status={request.status} />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Estimated Amount</p>
            <p className="num mt-1 text-lg font-semibold text-slate-900">{money(request.estimatedAmount)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Cost Center</p>
            <p className="mt-1 font-medium text-slate-800">{request.costCenter?.name ?? '-'}</p>
          </div>
        </div>

        {request.justification && (
          <div className="mb-4">
            <p className="mb-1 text-xs font-medium tracking-wide text-slate-400 uppercase">Justification</p>
            <p className="text-sm text-slate-700">{request.justification}</p>
          </div>
        )}

        {request.items.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium tracking-wide text-slate-400 uppercase">Line Items</p>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200/80 bg-slate-50/80">
                  <tr>
                    <th className="th">Description</th>
                    <th className="th text-right">Qty</th>
                    <th className="th text-right">Unit Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {request.items.map((i) => (
                    <tr key={i.id}>
                      <td className="td">{i.description}</td>
                      <td className="td num text-right">{i.quantity}</td>
                      <td className="td num text-right">{money(i.estimatedUnitCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {request.comments && (
          <div className="mb-4 rounded-lg bg-slate-50 p-3.5">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <MessageSquareQuote size={13} />
              Approver Comments
            </p>
            <p className="text-sm text-slate-700 italic">"{request.comments}"</p>
          </div>
        )}

        {request.status === 'PENDING' && canApprove(user?.role) && (
          <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
            <div>
              <textarea
                value={comments}
                onChange={(e) => {
                  setComments(e.target.value);
                  if (commentError) setCommentError('');
                }}
                aria-invalid={!!commentError}
                placeholder="Comments (required for rejection)"
                className="input"
                rows={2}
              />
              {commentError && <FieldError>{commentError}</FieldError>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => act('approve')} disabled={busy} className="btn-success">
                {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
                Approve
              </button>
              <button onClick={() => act('reject')} disabled={busy} className="btn-danger-soft">
                <X size={15} />
                Reject
              </button>
            </div>
          </div>
        )}
      </div>

      {request.status === 'APPROVED' && (
        <div className="card p-6">
          <h2 className="card-title mb-3">Purchase Orders</h2>
          {request.purchaseOrders.length === 0 ? (
            <div>
              <p className="mb-3 text-sm text-slate-500">No purchase order issued yet for this request.</p>
              <Link to={`/purchases/orders?fromRequest=${request.id}`} className="btn-primary btn-sm inline-flex">
                Create Purchase Order
                <ArrowRight size={13} />
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {request.purchaseOrders.map((po) => (
                <li key={po.id}>
                  <Link to={`/purchases/orders/${po.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline">
                    {po.poNumber}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
