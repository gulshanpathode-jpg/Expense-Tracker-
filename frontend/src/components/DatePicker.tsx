import { useEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromISO(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function displayLabel(iso: string) {
  const d = fromISO(iso);
  if (!d) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Calendar-popover date picker (replaces the native browser date input).
// value/onChange use the ISO 'YYYY-MM-DD' format the API expects.
export default function DatePicker({
  value,
  onChange,
  invalid,
  min,
  max,
  className,
}: {
  value: string;
  onChange: (iso: string) => void;
  invalid?: boolean;
  min?: string;
  max?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = fromISO(value);
  const today = new Date();
  const [viewYear, setViewYear] = useState((selected ?? today).getFullYear());
  const [viewMonth, setViewMonth] = useState((selected ?? today).getMonth());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && selected) {
      setViewYear(selected.getFullYear());
      setViewMonth(selected.getMonth());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const minDate = min ? fromISO(min) : null;
  const maxDate = max ? fromISO(max) : null;

  function isDisabled(d: Date) {
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  }

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  // Monday-first grid.
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <button
        type="button"
        aria-invalid={invalid || undefined}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'input flex w-full items-center justify-between gap-2 text-left',
          open && 'border-brand-400 ring-2 ring-brand-100',
        )}
      >
        <span className={value ? 'text-slate-900' : 'text-slate-400'}>
          {value ? displayLabel(value) : 'Pick a date'}
        </span>
        <CalendarIcon size={15} className="shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-pop">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-semibold text-slate-900">
              {MONTHS[viewMonth]} {viewYear}
            </p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1 text-center text-[11px] font-medium text-slate-400">
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              if (!d) return <span key={`blank-${i}`} />;
              const iso = toISO(d);
              const isSelected = value === iso;
              const isToday = toISO(today) === iso;
              const disabled = isDisabled(d);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={clsx(
                    'num mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors',
                    isSelected
                      ? 'bg-brand-600 font-semibold text-white shadow-sm'
                      : disabled
                      ? 'cursor-not-allowed text-slate-300'
                      : 'text-slate-700 hover:bg-brand-50 hover:text-brand-700',
                    isToday && !isSelected && 'ring-1 ring-brand-300',
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex justify-between border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => {
                const iso = toISO(today);
                if (!isDisabled(today)) {
                  onChange(iso);
                  setOpen(false);
                } else {
                  setViewYear(today.getFullYear());
                  setViewMonth(today.getMonth());
                }
              }}
              className="btn-ghost btn-sm text-brand-600"
            >
              Today
            </button>
            {value && (
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm">
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
