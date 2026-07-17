import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  UploadCloud,
  Paperclip,
  FileText,
  X,
  CircleAlert,
  LoaderCircle,
  ReceiptText,
  Landmark,
  StickyNote,
  Pencil,
  SendHorizonal,
  Save,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import type { AccountsCategory, Department, Expense, FinancialYear, PaymentMode, Vendor } from '../api/types';
import { Field, Modal } from '../components/ui';
import Select from '../components/Select';
import DatePicker from '../components/DatePicker';
import { formatDate, money, titleCase } from '../lib/format';

const PAYMENT_MODES: PaymentMode[] = ['CREDIT_CARD', 'DEBIT_CARD', 'UPI', 'BANK_TRANSFER', 'PAYPAL', 'CASH', 'CHEQUE', 'OTHERS'];

const FIELD_LABELS: Record<string, string> = {
  departmentId: 'Department',
  deptHeadId: 'Department Head',
  categoryId: 'Category',
  fyId: 'Financial Year',
  invoiceDate: 'Date',
  amount: 'Amount',
  paymentMode: 'Payment Method',
};

// Keeps only digits and a single decimal point — negatives are impossible to type.
function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
}

function describeApiError(err: any): string {
  const errorData = err.response?.data?.error;
  if (errorData && typeof errorData === 'object') {
    const fieldErrors = errorData.fieldErrors as Record<string, string[]> | undefined;
    if (fieldErrors) {
      const messages = Object.entries(fieldErrors)
        .filter(([, msgs]) => msgs?.length)
        .map(([field, msgs]) => `${FIELD_LABELS[field] ?? field}: ${msgs[0]}`);
      if (messages.length > 0) return messages.join('; ');
    }
    if (Array.isArray(errorData.formErrors) && errorData.formErrors.length > 0) {
      return errorData.formErrors.join(', ');
    }
  }
  if (typeof errorData === 'string' && errorData.trim()) return errorData;
  if (err.message) return err.message;
  return 'Could not save the expense. Please check the form and try again.';
}

export default function NewExpensePage() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEdit = !!editId;

  const authUser = useAuthStore((s) => s.user);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<AccountsCategory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [existing, setExisting] = useState<Expense | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [form, setForm] = useState({
    invoiceDate: new Date().toISOString().slice(0, 10),
    departmentId: authUser?.departmentId ?? '',
    deptHeadId: '',
    vendorId: '',
    vendorName: '',
    invoiceNo: '',
    amount: '',
    gstAmount: '',
    categoryId: '',
    paymentMode: 'BANK_TRANSFER' as PaymentMode,
    paymentDetails: '',
    description: '',
    fyId: '',
  });

  useEffect(() => {
    Promise.all([
      api.get('/departments'),
      api.get('/categories'),
      api.get('/vendors'),
      api.get('/financial-years'),
    ]).then(([dept, cat, v, fy]) => {
      setDepartments(dept.data.filter((d: Department) => d.isActive));
      setCategories(cat.data);
      setVendors(v.data);
      setFinancialYears(fy.data);
      if (!isEdit) setForm((f) => ({ ...f, fyId: fy.data[0]?.id ?? '' }));
    });
  }, [isEdit]);

  // Edit mode: hydrate the form from the existing expense.
  useEffect(() => {
    if (!editId) return;
    api.get(`/expenses/${editId}`).then((res) => {
      const e: Expense = res.data;
      setExisting(e);
      setForm({
        invoiceDate: e.invoiceDate.slice(0, 10),
        departmentId: e.departmentId,
        deptHeadId: e.deptHeadId ?? '',
        vendorId: e.vendorId ?? '',
        vendorName: e.vendor?.name ?? '',
        invoiceNo: e.invoiceNo ?? '',
        amount: String(e.amount),
        gstAmount: e.gstAmount != null ? String(e.gstAmount) : '',
        categoryId: e.categoryId,
        paymentMode: e.paymentMode,
        paymentDetails: e.paymentDetails ?? '',
        description: e.description ?? '',
        fyId: (e as any).fyId ?? '',
      });
    });
  }, [editId]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear a field's error as soon as the user edits it.
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const { [key as string]: _removed, ...rest } = prev;
      return rest;
    });
  }

  const hasErrors = Object.keys(errors).length > 0;

  const selectedFy = financialYears.find((fy) => fy.id === form.fyId);
  const selectedDept = departments.find((d) => d.id === form.departmentId);
  const selectedCategory = categories.find((c) => c.id === form.categoryId);
  const deptHeads = useMemo(() => selectedDept?.heads ?? [], [selectedDept]);
  const selectedHead = deptHeads.find((h) => h.id === form.deptHeadId);

  const departmentOptions = useMemo(() => departments.map((d) => ({ value: d.id, label: d.name })), [departments]);
  const headOptions = useMemo(() => deptHeads.map((h) => ({ value: h.id, label: h.name })), [deptHeads]);
  const categoryOptions = useMemo(() => categories.map((c) => ({ value: c.id, label: c.label })), [categories]);
  const fyOptions = useMemo(() => financialYears.map((fy) => ({ value: fy.id, label: fy.label })), [financialYears]);
  const paymentOptions = useMemo(() => PAYMENT_MODES.map((m) => ({ value: m, label: titleCase(m) })), []);

  const isDraftContext = !isEdit || existing?.status === 'DRAFT';

  function validate(forDraft: boolean) {
    const e: Record<string, string> = {};
    if (!form.invoiceDate) e.invoiceDate = 'Choose the invoice date';
    if (!form.amount) e.amount = 'Enter the amount';
    else if (Number(form.amount) <= 0) e.amount = 'Amount must be greater than 0';
    if (form.gstAmount && Number(form.gstAmount) < 0) e.gstAmount = 'GST cannot be negative';
    if (!form.departmentId) e.departmentId = 'Select a department';
    // Head attribution is mandatory only when actually submitting.
    if (!forDraft && deptHeads.length > 0 && !form.deptHeadId) e.deptHeadId = 'Select the department head';
    if (!form.categoryId) e.categoryId = 'Select a category';
    if (!form.fyId) e.fyId = 'Select a financial year';
    return e;
  }

  function focusFirstError() {
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
    });
  }

  function handleFilesSelected(selected: File[]) {
    setFiles(selected);
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  // Step 1: validate and open the review screen.
  function handleReview(e: React.FormEvent) {
    e.preventDefault();
    const found = validate(false);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError();
      return;
    }
    setShowPreview(true);
  }

  // Save as draft: lighter validation, no review modal.
  async function saveDraft() {
    const found = validate(true);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError();
      return;
    }
    await persist('DRAFT');
  }

  // Step 2: actually record the expense after the user confirms the preview.
  async function confirmSubmit() {
    await persist('SUBMITTED');
  }

  async function persist(status: 'DRAFT' | 'SUBMITTED') {
    setSubmitting(true);
    try {
      if (isEdit) {
        // Submitted expenses stay submitted; drafts keep/raise their status.
        const nextStatus = existing?.status === 'SUBMITTED' ? 'SUBMITTED' : status;
        const res = await api.put(`/expenses/${editId}`, {
          departmentId: form.departmentId,
          deptHeadId: form.deptHeadId || null,
          vendorId: form.vendorId || null,
          categoryId: form.categoryId,
          invoiceNo: form.invoiceNo || null,
          invoiceDate: form.invoiceDate,
          amount: Number(form.amount),
          gstAmount: form.gstAmount ? Number(form.gstAmount) : null,
          paymentMode: form.paymentMode,
          paymentDetails: form.paymentDetails || null,
          description: form.description || null,
          status: nextStatus,
        });
        toast.success(
          existing?.status === 'DRAFT' && nextStatus === 'SUBMITTED' ? 'Draft submitted' : 'Expense updated',
        );
        navigate(`/expenses/${res.data.id}`);
      } else {
        const fd = new FormData();
        fd.append('departmentId', form.departmentId);
        if (form.deptHeadId) fd.append('deptHeadId', form.deptHeadId);
        if (form.vendorId) fd.append('vendorId', form.vendorId);
        if (!form.vendorId && form.vendorName) fd.append('vendorName', form.vendorName);
        fd.append('categoryId', form.categoryId);
        if (form.invoiceNo) fd.append('invoiceNo', form.invoiceNo);
        fd.append('invoiceDate', form.invoiceDate);
        fd.append('amount', form.amount);
        if (form.gstAmount) fd.append('gstAmount', form.gstAmount);
        fd.append('paymentMode', form.paymentMode);
        if (form.paymentDetails) fd.append('paymentDetails', form.paymentDetails);
        if (form.description) fd.append('description', form.description);
        fd.append('fyId', form.fyId);
        fd.append('status', status);
        files.forEach((f) => fd.append('attachments', f));

        const res = await api.post('/expenses', fd, { headers: { 'Content-Type': 'multipart/form-data' } });

        if (status === 'DRAFT') {
          toast.success('Saved as draft');
        } else if (res.data.duplicateWarning) {
          toast.warning(`Recorded, but this may be a duplicate. ${res.data.duplicateWarning}`);
        } else {
          toast.success('Expense submitted');
        }
        navigate(`/expenses/${res.data.expense.id}`);
      }
    } catch (err: any) {
      setShowPreview(false);
      toast.error(describeApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const title = isEdit ? (existing?.status === 'DRAFT' ? 'Edit Draft' : 'Edit Expense') : 'Add Expense';

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {isEdit
            ? 'Update the expense details below.'
            : 'Enter the expense details and attach the bill or invoice. All amounts are in INR (₹).'}
        </p>
      </div>

      <form ref={formRef} noValidate onSubmit={handleReview} className="card divide-y divide-slate-100">
        {!isEdit && (
          <section className="p-6">
            <SectionHeading
              icon={<Paperclip size={14} />}
              title="Attachments"
              hint="PDF, JPG, or PNG, up to 10MB each."
            />

            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFilesSelected(Array.from(e.dataTransfer.files ?? []));
              }}
              className={clsx(
                'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
                dragOver ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 bg-slate-50/60 hover:border-brand-300 hover:bg-brand-50/40',
              )}
            >
              <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm ring-1 ring-slate-200">
                <UploadCloud size={18} />
              </div>
              <p className="text-sm font-medium text-slate-700">
                Drop your bill here, or <span className="text-brand-600">browse</span>
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Attach the invoice or receipt for this expense
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => handleFilesSelected(Array.from(e.target.files ?? []))}
                className="hidden"
              />
            </div>

            {files.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {files.map((f) => (
                  <span
                    key={f.name}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1 pr-1 pl-2.5 text-xs text-slate-700"
                  >
                    <FileText size={12} className="text-slate-400" />
                    {f.name}
                    <button
                      type="button"
                      onClick={() => removeFile(f.name)}
                      className="rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ---- Invoice details ---- */}
        <section className="p-6">
          <SectionHeading icon={<ReceiptText size={14} />} title="Invoice Details" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Date" required error={errors.invoiceDate}>
              <DatePicker
                value={form.invoiceDate}
                onChange={(iso) => update('invoiceDate', iso)}
                invalid={!!errors.invoiceDate}
                min={selectedFy?.startDate?.slice(0, 10)}
                max={selectedFy?.endDate?.slice(0, 10)}
              />
            </Field>
            <Field label="Merchant">
              <input
                list="vendor-list"
                value={form.vendorName}
                onChange={(e) => {
                  const match = vendors.find((v) => v.name === e.target.value);
                  update('vendorName', e.target.value);
                  update('vendorId', match?.id ?? '');
                }}
                className="input"
                placeholder="Search or type vendor"
              />
              <datalist id="vendor-list">
                {vendors.map((v) => (
                  <option key={v.id} value={v.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Amount (₹)" required error={errors.amount}>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium text-slate-400">₹</span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-invalid={!!errors.amount}
                  value={form.amount}
                  onChange={(e) => update('amount', sanitizeAmount(e.target.value))}
                  className="input pl-7"
                  placeholder="0.00"
                />
              </div>
            </Field>
            <Field label="GST Amount (₹)" error={errors.gstAmount}>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium text-slate-400">₹</span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-invalid={!!errors.gstAmount}
                  value={form.gstAmount}
                  onChange={(e) => update('gstAmount', sanitizeAmount(e.target.value))}
                  className="input pl-7"
                  placeholder="0.00"
                />
              </div>
            </Field>
            <Field label="Invoice Number">
              <input value={form.invoiceNo} onChange={(e) => update('invoiceNo', e.target.value)} className="input" placeholder="e.g. INV-2041" />
            </Field>
          </div>
        </section>

        {/* ---- Classification ---- */}
        <section className="p-6">
          <SectionHeading icon={<Landmark size={14} />} title="Classification" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Department" required error={errors.departmentId}>
              <Select
                value={form.departmentId}
                onChange={(v) => {
                  update('departmentId', v);
                  update('deptHeadId', '');
                }}
                options={departmentOptions}
                placeholder="Select department"
                invalid={!!errors.departmentId}
              />
            </Field>
            <Field
              label="Department Head"
              required={deptHeads.length > 0}
              error={errors.deptHeadId}
              hint={form.departmentId && deptHeads.length === 0 ? 'This department has no heads — spend is tracked at department level.' : undefined}
            >
              <Select
                value={form.deptHeadId}
                onChange={(v) => update('deptHeadId', v)}
                options={headOptions}
                placeholder={deptHeads.length > 0 ? 'Select head' : 'Not applicable'}
                disabled={deptHeads.length === 0}
                invalid={!!errors.deptHeadId}
              />
            </Field>
            <Field label="Category" required error={errors.categoryId}>
              <Select
                value={form.categoryId}
                onChange={(v) => update('categoryId', v)}
                options={categoryOptions}
                placeholder="Select category"
                invalid={!!errors.categoryId}
              />
            </Field>
            <Field label="Financial Year" required error={errors.fyId}>
              <Select
                value={form.fyId}
                onChange={(v) => update('fyId', v)}
                options={fyOptions}
                placeholder="Select financial year"
                invalid={!!errors.fyId}
                disabled={isEdit}
              />
            </Field>
          </div>
        </section>

        {/* ---- Payment & notes ---- */}
        <section className="p-6">
          <SectionHeading icon={<StickyNote size={14} />} title="Payment &amp; Notes" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Payment Method" required>
              <Select
                value={form.paymentMode}
                onChange={(v) => update('paymentMode', v as PaymentMode)}
                options={paymentOptions}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Payment Details" hint="Any additional payment details such as bank account information or cheque number.">
                <textarea
                  value={form.paymentDetails}
                  onChange={(e) => update('paymentDetails', e.target.value)}
                  className="input min-h-16"
                  placeholder="Enter payment details"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Description / Notes">
                <textarea value={form.description} onChange={(e) => update('description', e.target.value)} className="input min-h-20" placeholder="What was this expense for?" />
              </Field>
            </div>
          </div>
        </section>

        {/* ---- Actions ---- */}
        <div className="flex flex-col items-stretch gap-3 rounded-b-xl bg-slate-50/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
          {hasErrors && (
            <p className="flex items-center gap-1 text-xs font-medium text-red-600 sm:mr-auto">
              <CircleAlert size={13} className="shrink-0" />
              Please fix the highlighted fields.
            </p>
          )}
          {isDraftContext && (
            <button type="button" disabled={submitting} onClick={saveDraft} className="btn-secondary">
              {submitting ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
              Save as Draft
            </button>
          )}
          <button type="submit" disabled={submitting} className="btn-primary">
            <SendHorizonal size={15} />
            {isEdit ? (existing?.status === 'DRAFT' ? 'Submit' : 'Save Changes') : 'Submit'}
          </button>
        </div>
      </form>

      {/* ---- Review before submitting ---- */}
      <Modal
        open={showPreview}
        onClose={() => !submitting && setShowPreview(false)}
        title="Review your expense"
        footer={
          <>
            <button type="button" disabled={submitting} onClick={() => setShowPreview(false)} className="btn-secondary btn-sm">
              <Pencil size={13} />
              Edit
            </button>
            <button type="button" disabled={submitting} onClick={confirmSubmit} className="btn-primary btn-sm">
              {submitting ? <LoaderCircle size={13} className="animate-spin" /> : <SendHorizonal size={13} />}
              {isEdit && existing?.status === 'SUBMITTED' ? 'Confirm & Save' : 'Confirm & Submit'}
            </button>
          </>
        }
      >
        <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-center">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Total Amount</p>
          <p className="num mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
            {money(Number(form.amount || 0), 'INR', 2)}
          </p>
          {form.gstAmount && Number(form.gstAmount) > 0 && (
            <p className="mt-0.5 text-xs text-slate-500">incl. GST {money(Number(form.gstAmount), 'INR', 2)}</p>
          )}
        </div>
        <dl className="divide-y divide-slate-100 text-sm">
          <PreviewRow label="Date" value={formatDate(form.invoiceDate)} />
          <PreviewRow label="Merchant" value={form.vendorName || '—'} />
          <PreviewRow label="Invoice Number" value={form.invoiceNo || '—'} />
          <PreviewRow label="Department" value={selectedDept?.name ?? '—'} />
          <PreviewRow label="Department Head" value={selectedHead?.name ?? '—'} />
          <PreviewRow label="Category" value={selectedCategory?.label ?? '—'} />
          <PreviewRow label="Financial Year" value={selectedFy?.label ?? '—'} />
          <PreviewRow label="Payment Method" value={titleCase(form.paymentMode)} />
          {form.paymentDetails && <PreviewRow label="Payment Details" value={form.paymentDetails} />}
          {form.description && <PreviewRow label="Description" value={form.description} />}
          {!isEdit && (
            <PreviewRow
              label="Attachments"
              value={files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'} attached` : 'None'}
            />
          )}
        </dl>
        <p className="mt-3 text-xs text-slate-400">
          Double-check the details above. Use Edit to go back and change anything.
        </p>
      </Modal>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words text-slate-900">{value}</dd>
    </div>
  );
}

function SectionHeading({ icon, title, hint }: { icon: React.ReactNode; title: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-600">{icon}</span>
        {title}
      </h2>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
