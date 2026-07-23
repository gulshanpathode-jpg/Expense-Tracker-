import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, ReceiptText, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api/client';
import type { AccountsCategory, Department, Expense, FinancialYear, PaymentMode, Vendor } from '../api/types';
import { useAuthStore } from '../store/authStore';
import { Avatar, EmptyState, FilterField, PageHeader, SkeletonRows } from '../components/ui';
import Select from '../components/Select';
import DatePicker from '../components/DatePicker';
import { formatDate, money, titleCase } from '../lib/format';

const PAYMENT_MODES: PaymentMode[] = ['CREDIT_CARD', 'DEBIT_CARD', 'UPI', 'BANK_TRANSFER', 'PAYPAL', 'CASH', 'CHEQUE', 'OTHERS'];
const PAGE_SIZE = 25;

const canSeeDepartments = (role?: string) => role === 'ADMIN' || role === 'ACCOUNTS';
// ACCOUNTS is the only fully read-only role; owners can file within their portfolio.
const canAddExpense = (role?: string) => role !== 'ACCOUNTS';

export default function ExpensesPage() {
  const user = useAuthStore((s) => s.user);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Server-side pagination.
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<AccountsCategory[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);

  const [departmentId, setDepartmentId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [status, setStatus] = useState('');
  const [fyId, setFyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  useEffect(() => {
    api.get('/vendors').then((res) => setVendors(res.data));
    api.get('/categories').then((res) => setCategories(res.data));
    api.get('/financial-years').then((res) => setFinancialYears(res.data));
    if (canSeeDepartments(user?.role)) api.get('/departments').then((res) => setDepartments(res.data.filter((d: Department) => d.isActive)));
  }, [user?.role]);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Reset to the first page whenever the filter set changes.
  const filterKey = [qDebounced, departmentId, vendorId, categoryId, paymentMode, status, fyId, from, to, amountMin, amountMax].join('|');
  useEffect(() => {
    setPage(1);
  }, [filterKey]);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) };
    if (qDebounced) params.q = qDebounced;
    if (departmentId) params.departmentId = departmentId;
    if (vendorId) params.vendorId = vendorId;
    if (categoryId) params.categoryId = categoryId;
    if (paymentMode) params.paymentMode = paymentMode;
    if (status) params.status = status;
    if (fyId) params.fyId = fyId;
    if (from) params.from = from;
    if (to) params.to = to;
    if (amountMin) params.amountMin = amountMin;
    if (amountMax) params.amountMax = amountMax;
    api
      .get('/expenses', { params })
      .then((res) => {
        setExpenses(res.data.items ?? []);
        setTotalCount(res.data.total ?? 0);
        setTotalAmount(res.data.totalAmount ?? 0);
      })
      .finally(() => setLoading(false));
  }, [filterKey, page]);

  const resetFilters = () => {
    setDepartmentId('');
    setVendorId('');
    setCategoryId('');
    setPaymentMode('');
    setStatus('');
    setFyId('');
    setFrom('');
    setTo('');
    setAmountMin('');
    setAmountMax('');
  };

  const activeFilterCount = [departmentId, vendorId, categoryId, paymentMode, status, fyId, from, to, amountMin, amountMax].filter(Boolean).length;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);

  const departmentOptions = useMemo(() => departments.map((d) => ({ value: d.id, label: d.name })), [departments]);
  const vendorOptions = useMemo(() => vendors.map((v) => ({ value: v.id, label: v.name })), [vendors]);
  const categoryOptions = useMemo(() => categories.map((c) => ({ value: c.id, label: c.label })), [categories]);
  const paymentOptions = useMemo(() => PAYMENT_MODES.map((m) => ({ value: m, label: titleCase(m) })), []);
  const fyOptions = useMemo(() => financialYears.map((fy) => ({ value: fy.id, label: fy.label })), [financialYears]);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Expenses"
        subtitle="All recorded expenses across your scope."
        actions={
          canAddExpense(user?.role) ? (
            <Link to="/expenses/new" className="btn-primary">
              <Plus size={15} />
              Add Expense
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <div className="flex w-full items-center gap-2 lg:w-auto">
          <div className="relative min-w-0 flex-1 lg:flex-none">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search invoice #, vendor, notes..."
              className="input w-full pl-9 lg:w-72"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={clsx('btn-secondary relative', showFilters && 'bg-slate-100')}
          >
            <SlidersHorizontal size={15} />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="card mb-4 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {canSeeDepartments(user?.role) && (
              <FilterField label="Department">
                <Select value={departmentId} onChange={setDepartmentId} options={departmentOptions} placeholder="All" clearable />
              </FilterField>
            )}

            <FilterField label="Merchant">
              <Select value={vendorId} onChange={setVendorId} options={vendorOptions} placeholder="All" clearable />
            </FilterField>

            <FilterField label="Category">
              <Select value={categoryId} onChange={setCategoryId} options={categoryOptions} placeholder="All" clearable />
            </FilterField>

            <FilterField label="Payment Method">
              <Select value={paymentMode} onChange={setPaymentMode} options={paymentOptions} placeholder="All" clearable />
            </FilterField>

            <FilterField label="Status">
              <Select
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'DRAFT', label: 'Draft' },
                  { value: 'SUBMITTED', label: 'Submitted' },
                ]}
                placeholder="All"
                clearable
              />
            </FilterField>

            <FilterField label="Financial Year">
              <Select value={fyId} onChange={setFyId} options={fyOptions} placeholder="All" clearable />
            </FilterField>

            <FilterField label="From">
              <DatePicker value={from} onChange={setFrom} />
            </FilterField>

            <FilterField label="To">
              <DatePicker value={to} onChange={setTo} />
            </FilterField>

            <FilterField label="Min Amount (₹)">
              <input
                type="text"
                inputMode="decimal"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value.replace(/[^0-9.]/g, ''))}
                className="input"
                placeholder="0"
              />
            </FilterField>

            <FilterField label="Max Amount (₹)">
              <input
                type="text"
                inputMode="decimal"
                value={amountMax}
                onChange={(e) => setAmountMax(e.target.value.replace(/[^0-9.]/g, ''))}
                className="input"
                placeholder="Any"
              />
            </FilterField>
          </div>
          {activeFilterCount > 0 && (
            <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
              <button onClick={resetFilters} className="btn-ghost btn-sm">
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        {/* Mobile: stacked cards */}
        <div className="divide-y divide-slate-100 md:hidden">
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4">
                <div className="skeleton mb-2 h-4 w-40" />
                <div className="skeleton mb-2 h-3 w-56" />
                <div className="skeleton h-3 w-24" />
              </div>
            ))}
          {!loading &&
            expenses.map((e) => (
              <Link key={e.id} to={`/expenses/${e.id}`} className="block p-4 transition-colors active:bg-slate-50">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="num text-xs text-slate-400">{formatDate(e.invoiceDate)}</span>
                    {e.status === 'DRAFT' && <span className="badge bg-amber-50 text-amber-700">Draft</span>}
                  </span>
                  <span className="badge bg-slate-100 text-slate-600">
                    {e.department?.name ?? '-'}
                    {e.deptHead?.name ? ` · ${e.deptHead.name}` : ''}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate font-medium text-slate-900">{e.vendor?.name ?? 'Expense'}</p>
                  <p className="num shrink-0 font-semibold text-slate-900">{money(e.amount)}</p>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {e.category?.label ?? '-'}
                  {e.user?.name ? ` · ${e.user.name}` : ''}
                </p>
              </Link>
            ))}
          {!loading && expenses.length > 0 && (
            <div className="flex items-center justify-between bg-slate-50/80 px-4 py-3 text-sm">
              <span className="text-xs text-slate-500">
                {totalCount} expense{totalCount === 1 ? '' : 's'}
              </span>
              <span className="num font-semibold text-slate-900">{money(totalAmount)}</span>
            </div>
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/80">
              <tr>
                <th className="th">Date</th>
                <th className="th">Vendor</th>
                <th className="th hidden lg:table-cell">Category</th>
                <th className="th">Department</th>
                <th className="th">Submitted By</th>
                <th className="th text-right">Amount</th>
              </tr>
            </thead>
            {loading ? (
              <SkeletonRows cols={6} rows={6} />
            ) : (
              <tbody className="divide-y divide-slate-100">
                {expenses.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="td num whitespace-nowrap">
                      <Link to={`/expenses/${e.id}`} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
                        {formatDate(e.invoiceDate)}
                      </Link>
                    </td>
                    <td className="td font-medium text-slate-900">
                      <span className="flex items-center gap-1.5">
                        {e.vendor?.name ?? '-'}
                        {e.status === 'DRAFT' && <span className="badge bg-amber-50 text-amber-700">Draft</span>}
                      </span>
                    </td>
                    <td className="td hidden lg:table-cell">{e.category?.label ?? '-'}</td>
                    <td className="td">
                      {e.department?.name ?? '-'}
                      {e.deptHead?.name ? <span className="text-slate-400"> · {e.deptHead.name}</span> : ''}
                    </td>
                    <td className="td">
                      {e.user?.name ? (
                        <span className="flex items-center gap-2">
                          <Avatar name={e.user.name} size="sm" />
                          {e.user.name}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="td num text-right font-semibold text-slate-900">{money(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            )}
            {!loading && expenses.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/80">
                  <td className="px-4 py-3 text-xs text-slate-500" colSpan={4}>
                    {totalCount} expense{totalCount === 1 ? '' : 's'} (filtered total)
                  </td>
                  <td className="hidden lg:table-cell" />
                  <td className="num px-4 py-3 text-right font-semibold text-slate-900">{money(totalAmount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!loading && expenses.length === 0 && (
          <EmptyState
            icon={<ReceiptText size={20} />}
            title="No expenses found"
            hint={canAddExpense(user?.role) ? 'Try clearing the filters, or add your first expense.' : 'Try clearing the filters.'}
            action={
              canAddExpense(user?.role) ? (
                <Link to="/expenses/new" className="btn-secondary btn-sm">
                  <Plus size={13} />
                  Add Expense
                </Link>
              ) : undefined
            }
          />
        )}
      </div>

      {totalCount > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Showing <span className="num font-medium text-slate-700">{rangeStart}–{rangeEnd}</span> of{' '}
            <span className="num font-medium text-slate-700">{totalCount}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="btn-secondary btn-sm"
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <span className="num text-xs text-slate-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="btn-secondary btn-sm"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
