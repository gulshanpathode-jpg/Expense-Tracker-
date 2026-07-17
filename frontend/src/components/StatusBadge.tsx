import clsx from 'clsx';
import { titleCase } from '../lib/format';

export type AnyStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CORRECTION_NEEDED'
  | 'ISSUED'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'
  | 'CLOSED'
  | 'CANCELLED';

const STYLES: Record<AnyStatus, { pill: string; dot: string }> = {
  DRAFT: { pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  PENDING: { pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20', dot: 'bg-amber-500' },
  APPROVED: { pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20', dot: 'bg-emerald-500' },
  REJECTED: { pill: 'bg-red-50 text-red-700 ring-1 ring-red-600/20', dot: 'bg-red-500' },
  CORRECTION_NEEDED: { pill: 'bg-orange-50 text-orange-700 ring-1 ring-orange-600/20', dot: 'bg-orange-500' },
  ISSUED: { pill: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/20', dot: 'bg-sky-500' },
  PARTIALLY_DELIVERED: { pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20', dot: 'bg-amber-500' },
  DELIVERED: { pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20', dot: 'bg-emerald-500' },
  CLOSED: { pill: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
  CANCELLED: { pill: 'bg-red-50 text-red-700 ring-1 ring-red-600/20', dot: 'bg-red-500' },
};

export default function StatusBadge({ status }: { status: AnyStatus | string }) {
  const style = STYLES[status as AnyStatus] ?? STYLES.DRAFT;
  return (
    <span className={clsx('badge', style.pill)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', style.dot)} />
      {titleCase(status)}
    </span>
  );
}
