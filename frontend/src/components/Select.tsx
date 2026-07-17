import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import clsx from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

// Custom listbox-style dropdown that replaces native <select> so every browser
// shows the same polished UI (rounded panel, hover states, check on selection).
export default function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  invalid,
  disabled,
  clearable,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const searchable = options.length > 7;

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(Math.max(0, filtered.findIndex((o) => o.value === value)));
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function choose(option: SelectOption) {
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[activeIndex]) choose(filtered[activeIndex]);
    }
  }

  return (
    <div ref={rootRef} className={clsx('relative', className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'input flex w-full items-center justify-between gap-2 text-left',
          disabled && 'cursor-not-allowed opacity-60',
          open && 'border-brand-400 ring-2 ring-brand-100',
        )}
      >
        <span className={clsx('truncate', selected ? 'text-slate-900' : 'text-slate-400')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={clsx('shrink-0 text-slate-400 transition-transform duration-150', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full min-w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop">
          {searchable && (
            <div className="relative border-b border-slate-100 p-2">
              <Search size={13} className="pointer-events-none absolute top-1/2 left-4.5 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                placeholder="Search…"
                className="w-full rounded-lg bg-slate-50 py-1.5 pr-2.5 pl-7.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          )}
          <ul ref={listRef} role="listbox" className="max-h-60 overflow-y-auto p-1">
            {clearable && !query && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm text-slate-400 hover:bg-slate-50"
                >
                  {placeholder}
                </button>
              </li>
            )}
            {filtered.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <li key={o.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    data-index={i}
                    onClick={() => choose(o)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={clsx(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                      i === activeIndex ? 'bg-brand-50 text-brand-900' : 'text-slate-700',
                      isSelected && 'font-medium',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{o.label}</span>
                      {o.hint && <span className="block truncate text-xs font-normal text-slate-400">{o.hint}</span>}
                    </span>
                    {isSelected && <Check size={14} className="shrink-0 text-brand-600" />}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">No matches found</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
