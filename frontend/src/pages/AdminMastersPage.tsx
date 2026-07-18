import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Tags, Wallet, Plus, Pencil, Check, X, UserPlus, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import type { AccountsCategory, Budget, Department, DepartmentHead, FinancialYear, UserSummary } from '../api/types';
import { PageHeader, Modal } from '../components/ui';
import Select from '../components/Select';
import { money, titleCase } from '../lib/format';

function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
}

// Password policy shared with the backend: 8+ chars, a letter and a number.
function isStrongPassword(p: string): boolean {
  return p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
}
const PASSWORD_HINT = 'Min 8 characters, with a letter and a number';

// Admin is a single account, so only these two roles can be assigned here.
const ROLE_OPTIONS = [
  { value: 'EMPLOYEE', label: 'Employee' },
  { value: 'DEPARTMENT_HEAD', label: 'Department Head' },
];

export default function AdminMastersPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<AccountsCategory[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);

  // Departments card
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptHeads, setNewDeptHeads] = useState('');
  const [addingHeadDeptId, setAddingHeadDeptId] = useState<string | null>(null);
  const [newHeadName, setNewHeadName] = useState('');

  // Categories card
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [newCategoryBudget, setNewCategoryBudget] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingBudgetValue, setEditingBudgetValue] = useState('');

  // Budgets card
  const [budgetDeptId, setBudgetDeptId] = useState('');
  const [budgetHeadId, setBudgetHeadId] = useState('');
  const [budgetFyId, setBudgetFyId] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');

  // Users card
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('EMPLOYEE');
  const [userDeptId, setUserDeptId] = useState('');
  const [userHeadId, setUserHeadId] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userPasswordConfirm, setUserPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

  // Reset-password modal
  const [resetUser, setResetUser] = useState<UserSummary | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetting, setResetting] = useState(false);

  // Change-my-password
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  function loadAll() {
    api.get('/departments').then((r) => setDepartments(r.data));
    api.get('/categories').then((r) => setCategories(r.data));
    api.get('/users').then((r) => setUsers(r.data));
    api.get('/financial-years').then((r) => {
      setFinancialYears(r.data);
      setBudgetFyId((prev) => prev || (r.data[0]?.id ?? ''));
    });
  }

  useEffect(loadAll, []);

  function loadBudgets(fyId: string) {
    if (!fyId) return;
    api.get('/budgets', { params: { fyId } }).then((r) => setBudgets(r.data));
  }

  useEffect(() => loadBudgets(budgetFyId), [budgetFyId]);

  const activeDepartments = useMemo(() => departments.filter((d) => d.isActive), [departments]);
  const departmentOptions = useMemo(() => activeDepartments.map((d) => ({ value: d.id, label: d.name })), [activeDepartments]);
  const fyOptions = useMemo(() => financialYears.map((fy) => ({ value: fy.id, label: fy.label })), [financialYears]);

  const budgetDeptHeads = useMemo(
    () => activeDepartments.find((d) => d.id === budgetDeptId)?.heads ?? [],
    [activeDepartments, budgetDeptId],
  );
  const budgetHeadOptions = useMemo(
    () => budgetDeptHeads.map((h: DepartmentHead) => ({ value: h.id, label: h.name })),
    [budgetDeptHeads],
  );

  // For a new department-head user: that department's heads not yet linked to a user.
  const userHeadOptions = useMemo(() => {
    const dept = activeDepartments.find((d) => d.id === userDeptId);
    return (dept?.heads ?? [])
      .filter((h) => !h.userId)
      .map((h) => ({ value: h.id, label: h.name }));
  }, [activeDepartments, userDeptId]);

  async function addDepartment() {
    if (!newDeptName.trim()) {
      toast.error('Enter a department name');
      return;
    }
    const heads = newDeptHeads.split(',').map((h) => h.trim()).filter(Boolean);
    if (heads.length === 0) {
      toast.error('At least one department head is required');
      return;
    }
    try {
      await api.post('/departments', { name: newDeptName.trim(), heads });
      setNewDeptName('');
      setNewDeptHeads('');
      toast.success(`Department created with ${heads.length} head${heads.length === 1 ? '' : 's'}`);
      loadAll();
    } catch (err: any) {
      toast.error(errText(err) ?? 'Failed to create department');
    }
  }

  async function addHead(departmentId: string) {
    if (!newHeadName.trim()) return;
    try {
      await api.post('/department-heads', { departmentId, name: newHeadName.trim() });
      setNewHeadName('');
      setAddingHeadDeptId(null);
      toast.success('Department head added');
      loadAll();
    } catch (err: any) {
      toast.error(errText(err) ?? 'Failed to add head');
    }
  }

  async function addCategory() {
    if (!newCategoryLabel.trim()) return;
    try {
      await api.post('/categories', {
        label: newCategoryLabel.trim(),
        budgetAmount: newCategoryBudget ? Number(newCategoryBudget) : 0,
      });
      setNewCategoryLabel('');
      setNewCategoryBudget('');
      toast.success('Category created');
      loadAll();
    } catch (err: any) {
      toast.error(errText(err) ?? 'Failed to create category');
    }
  }

  async function saveCategoryBudget(cat: AccountsCategory) {
    try {
      await api.put(`/categories/${cat.id}`, { budgetAmount: Number(editingBudgetValue || 0) });
      setEditingCategoryId(null);
      toast.success(`Budget updated for ${cat.label}`);
      loadAll();
    } catch (err: any) {
      toast.error(errText(err) ?? 'Failed to update category');
    }
  }

  async function saveDeptBudget() {
    if (!budgetDeptId || !budgetFyId || !budgetAmount) {
      toast.error('Select department, financial year, and amount');
      return;
    }
    if (budgetHeadOptions.length > 0 && !budgetHeadId) {
      toast.error('Select the department head this budget belongs to');
      return;
    }
    try {
      await api.post('/budgets', {
        departmentId: budgetDeptId,
        deptHeadId: budgetHeadId || null,
        fyId: budgetFyId,
        annualAmount: Number(budgetAmount),
      });
      toast.success('Budget saved');
      setBudgetAmount('');
      setBudgetDeptId('');
      setBudgetHeadId('');
      loadBudgets(budgetFyId);
    } catch (err: any) {
      toast.error(errText(err) ?? 'Failed to save budget');
    }
  }

  async function createUser() {
    if (!userName.trim() || !userEmail.trim()) {
      toast.error('Name and email are required');
      return;
    }
    if (!userDeptId) {
      toast.error('Select a department');
      return;
    }
    if (userRole === 'DEPARTMENT_HEAD' && !userHeadId) {
      toast.error('Select which head this user is');
      return;
    }
    if (!isStrongPassword(userPassword)) {
      toast.error(PASSWORD_HINT);
      return;
    }
    if (userPassword !== userPasswordConfirm) {
      toast.error('Passwords do not match');
      return;
    }
    setCreatingUser(true);
    try {
      await api.post('/users', {
        name: userName.trim(),
        email: userEmail.trim(),
        role: userRole,
        departmentId: userDeptId || null,
        deptHeadId: userRole === 'DEPARTMENT_HEAD' ? userHeadId : null,
        password: userPassword,
      });
      toast.success(`User ${userName.trim()} created`);
      setUserName('');
      setUserEmail('');
      setUserRole('EMPLOYEE');
      setUserDeptId('');
      setUserHeadId('');
      setUserPassword('');
      setUserPasswordConfirm('');
      loadAll();
    } catch (err: any) {
      toast.error(errText(err) ?? 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  }

  async function submitReset() {
    if (!resetUser) return;
    if (!isStrongPassword(resetPw)) {
      toast.error(PASSWORD_HINT);
      return;
    }
    setResetting(true);
    try {
      await api.post(`/users/${resetUser.id}/reset-password`, { newPassword: resetPw });
      toast.success(`Password reset for ${resetUser.name}`);
      setResetUser(null);
      setResetPw('');
    } catch (err: any) {
      toast.error(errText(err) ?? 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  }

  async function changeMyPassword() {
    if (!curPw) {
      toast.error('Enter your current password');
      return;
    }
    if (!isStrongPassword(newPw)) {
      toast.error(PASSWORD_HINT);
      return;
    }
    if (newPw !== newPwConfirm) {
      toast.error('New passwords do not match');
      return;
    }
    setChangingPw(true);
    try {
      const res = await api.post('/auth/change-password', { currentPassword: curPw, newPassword: newPw });
      // The server rotates refresh tokens on password change — keep the new one.
      const { accessToken, setTokens } = useAuthStore.getState();
      if (res.data?.refreshToken && accessToken) setTokens(accessToken, res.data.refreshToken);
      toast.success('Your password has been changed');
      setCurPw('');
      setNewPw('');
      setNewPwConfirm('');
    } catch (err: any) {
      toast.error(errText(err) ?? 'Failed to change password');
    } finally {
      setChangingPw(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader title="Admin Setup" subtitle="Manage departments, heads, users, categories, budgets, and your password." />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="card p-5">
          <SectionTitle
            icon={<Building2 size={15} />}
            title="Departments & Heads"
            hint="Every department needs at least one head; budgets are allocated per head."
          />
          <div className="mb-3 space-y-2">
            <input
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              className="input"
              placeholder="Department name"
            />
            <div className="flex gap-2">
              <input
                value={newDeptHeads}
                onChange={(e) => setNewDeptHeads(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDepartment()}
                className="input"
                placeholder="Head name(s), comma-separated — required"
              />
              <button onClick={addDepartment} className="btn-primary shrink-0 px-3" aria-label="Add department">
                <Plus size={15} />
              </button>
            </div>
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto text-sm">
            {activeDepartments.map((d) => (
              <li key={d.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-700">{d.name}</span>
                  <button
                    onClick={() => {
                      setAddingHeadDeptId(addingHeadDeptId === d.id ? null : d.id);
                      setNewHeadName('');
                    }}
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-brand-600 hover:bg-brand-50"
                  >
                    <Plus size={12} /> Add head
                  </button>
                </div>
                {(d.heads?.length ?? 0) > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {d.heads!.map((h) => (
                      <span key={h.id} className="badge bg-slate-100 text-slate-600">
                        {h.name}
                        {h.userId && <ShieldCheck size={11} className="text-emerald-500" />}
                      </span>
                    ))}
                  </div>
                )}
                {addingHeadDeptId === d.id && (
                  <div className="mt-2 flex gap-2">
                    <input
                      autoFocus
                      value={newHeadName}
                      onChange={(e) => setNewHeadName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addHead(d.id)}
                      className="input py-1 text-xs"
                      placeholder="Head name"
                    />
                    <button onClick={() => addHead(d.id)} className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50" aria-label="Save head">
                      <Check size={14} />
                    </button>
                    <button onClick={() => setAddingHeadDeptId(null)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Cancel">
                      <X size={14} />
                    </button>
                  </div>
                )}
              </li>
            ))}
            {activeDepartments.length === 0 && <li className="py-4 text-sm text-slate-400">No departments yet.</li>}
          </ul>
        </div>

        <div className="card p-5">
          <SectionTitle icon={<Tags size={15} />} title="Categories" hint="Each category can carry its own annual budget." />
          <div className="mb-3 flex gap-2">
            <input
              value={newCategoryLabel}
              onChange={(e) => setNewCategoryLabel(e.target.value)}
              className="input"
              placeholder="Category name"
            />
            <input
              value={newCategoryBudget}
              onChange={(e) => setNewCategoryBudget(sanitizeAmount(e.target.value))}
              className="input w-32"
              inputMode="decimal"
              placeholder="Budget ₹"
            />
            <button onClick={addCategory} className="btn-primary shrink-0 px-3" aria-label="Add category">
              <Plus size={15} />
            </button>
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto text-sm">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate text-slate-700">{c.label}</span>
                {editingCategoryId === c.id ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <input
                      autoFocus
                      value={editingBudgetValue}
                      onChange={(e) => setEditingBudgetValue(sanitizeAmount(e.target.value))}
                      onKeyDown={(e) => e.key === 'Enter' && saveCategoryBudget(c)}
                      className="input w-28 py-1 text-xs"
                      inputMode="decimal"
                    />
                    <button onClick={() => saveCategoryBudget(c)} className="rounded-md p-1 text-emerald-600 hover:bg-emerald-50" aria-label="Save budget">
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditingCategoryId(null)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Cancel">
                      <X size={14} />
                    </button>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="num text-slate-500">{money(c.budgetAmount)}</span>
                    <button
                      onClick={() => {
                        setEditingCategoryId(c.id);
                        setEditingBudgetValue(String(c.budgetAmount || ''));
                      }}
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label={`Edit budget for ${c.label}`}
                    >
                      <Pencil size={13} />
                    </button>
                  </span>
                )}
              </li>
            ))}
            {categories.length === 0 && <li className="py-4 text-sm text-slate-400">No categories yet.</li>}
          </ul>
        </div>
      </div>

      <div className="card p-5">
        <SectionTitle
          icon={<UserPlus size={15} />}
          title="Users"
          hint="Create Employees and Department Heads. A head must be linked to an existing head record in their department."
        />
        <div className="mb-5 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label-xs">Full Name</label>
            <input value={userName} onChange={(e) => setUserName(e.target.value)} className="input" placeholder="e.g. Priya Sharma" />
          </div>
          <div>
            <label className="label-xs">Email</label>
            <input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} className="input" type="email" placeholder="name@dhaninfo.biz" />
          </div>
          <div>
            <label className="label-xs">Role</label>
            <Select
              value={userRole}
              onChange={(v) => {
                setUserRole(v);
                setUserHeadId('');
              }}
              options={ROLE_OPTIONS}
            />
          </div>
          <div>
            <label className="label-xs">Department</label>
            <Select
              value={userDeptId}
              onChange={(v) => {
                setUserDeptId(v);
                setUserHeadId('');
              }}
              options={departmentOptions}
              placeholder="Select department"
            />
          </div>
          {userRole === 'DEPARTMENT_HEAD' && (
            <div>
              <label className="label-xs">Which Head</label>
              <Select
                value={userHeadId}
                onChange={setUserHeadId}
                options={userHeadOptions}
                placeholder={!userDeptId ? 'Pick department first' : userHeadOptions.length ? 'Select head' : 'No unlinked heads'}
                disabled={!userDeptId || userHeadOptions.length === 0}
              />
            </div>
          )}
          <div>
            <label className="label-xs">Password</label>
            <div className="relative">
              <input
                value={userPassword}
                onChange={(e) => setUserPassword(e.target.value)}
                className="input pr-9"
                type={showPassword ? 'text' : 'password'}
                placeholder={PASSWORD_HINT}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {userPassword.length > 0 && !isStrongPassword(userPassword) && (
              <p className="mt-1 text-[11px] text-amber-600">{PASSWORD_HINT}</p>
            )}
          </div>
          <div>
            <label className="label-xs">Confirm Password</label>
            <input
              value={userPasswordConfirm}
              onChange={(e) => setUserPasswordConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createUser()}
              className="input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Re-enter password"
              autoComplete="new-password"
            />
            {userPasswordConfirm.length > 0 && userPassword !== userPasswordConfirm && (
              <p className="mt-1 text-[11px] text-red-600">Passwords do not match</p>
            )}
          </div>
        </div>
        <button onClick={createUser} disabled={creatingUser} className="btn-primary">
          {creatingUser ? 'Creating…' : 'Create User'}
        </button>

        {users.length > 0 && (
          <div className="mt-5 overflow-x-auto border-t border-slate-100 pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="th pl-0">Name</th>
                  <th className="th">Email</th>
                  <th className="th">Role</th>
                  <th className="th">Department</th>
                  <th className="th">Status</th>
                  <th className="th text-right pr-0">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="td pl-0 font-medium text-slate-800">{u.name}</td>
                    <td className="td text-slate-600">{u.email}</td>
                    <td className="td text-slate-600">{titleCase(u.role)}</td>
                    <td className="td text-slate-600">{departments.find((d) => d.id === u.departmentId)?.name ?? '—'}</td>
                    <td className="td">
                      <span className={u.isActive ? 'badge bg-emerald-50 text-emerald-700' : 'badge bg-slate-100 text-slate-500'}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="td pr-0 text-right">
                      <button
                        onClick={() => {
                          setResetUser(u);
                          setResetPw('');
                        }}
                        className="btn-ghost btn-sm"
                        title="Reset this user's password"
                      >
                        <KeyRound size={13} />
                        Reset
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-5">
        <SectionTitle
          icon={<Wallet size={15} />}
          title="Budgets (per Department Head)"
          hint="Set the annual budget per department head for a financial year. The amount splits evenly across 12 months."
        />
        <div className="mb-5 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label-xs">Department</label>
            <Select
              value={budgetDeptId}
              onChange={(v) => {
                setBudgetDeptId(v);
                setBudgetHeadId('');
              }}
              options={departmentOptions}
              placeholder="Select department"
            />
          </div>
          <div>
            <label className="label-xs">Department Head</label>
            <Select
              value={budgetHeadId}
              onChange={setBudgetHeadId}
              options={budgetHeadOptions}
              placeholder={budgetDeptId ? (budgetHeadOptions.length > 0 ? 'Select head' : 'No heads') : 'Pick department first'}
              disabled={!budgetDeptId || budgetHeadOptions.length === 0}
              clearable
            />
          </div>
          <div>
            <label className="label-xs">Financial Year</label>
            <Select value={budgetFyId} onChange={setBudgetFyId} options={fyOptions} placeholder="Select year" />
          </div>
          <div>
            <label className="label-xs">Annual Amount (₹)</label>
            <input
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(sanitizeAmount(e.target.value))}
              className="input"
              inputMode="decimal"
              placeholder="0"
            />
          </div>
          <button onClick={saveDeptBudget} className="btn-primary">
            Save Budget
          </button>
        </div>

        {budgets.length > 0 && (
          <div className="overflow-x-auto border-t border-slate-100 pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="th pl-0">Department</th>
                  <th className="th">Head</th>
                  <th className="th text-right">Allocated</th>
                  <th className="th text-right">Spent</th>
                  <th className="th text-right">Remaining</th>
                  <th className="th w-40">Utilization</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {budgets.map((b) => {
                  const pct = Math.min(100, b.utilizationPct ?? 0);
                  return (
                    <tr key={b.id}>
                      <td className="td pl-0 font-medium text-slate-800">{b.department?.name ?? '-'}</td>
                      <td className="td text-slate-600">{b.deptHead?.name ?? '—'}</td>
                      <td className="td num text-right">{money(b.annualAmount)}</td>
                      <td className="td num text-right">{money(b.totalUtilized ?? 0)}</td>
                      <td className="td num text-right">{money(b.totalRemaining ?? 0)}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={pct >= 90 ? 'h-full rounded-full bg-red-500' : pct >= 75 ? 'h-full rounded-full bg-amber-500' : 'h-full rounded-full bg-emerald-500'}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="num w-10 text-right text-xs text-slate-500">{(b.utilizationPct ?? 0).toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Change my password */}
      <div className="card p-5">
        <SectionTitle icon={<KeyRound size={15} />} title="Change My Password" hint="Update the password for your admin account." />
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3">
          <div>
            <label className="label-xs">Current Password</label>
            <input value={curPw} onChange={(e) => setCurPw(e.target.value)} className="input" type="password" autoComplete="current-password" placeholder="Current password" />
          </div>
          <div>
            <label className="label-xs">New Password</label>
            <input value={newPw} onChange={(e) => setNewPw(e.target.value)} className="input" type="password" autoComplete="new-password" placeholder={PASSWORD_HINT} />
            {newPw.length > 0 && !isStrongPassword(newPw) && <p className="mt-1 text-[11px] text-amber-600">{PASSWORD_HINT}</p>}
          </div>
          <div>
            <label className="label-xs">Confirm New Password</label>
            <input value={newPwConfirm} onChange={(e) => setNewPwConfirm(e.target.value)} className="input" type="password" autoComplete="new-password" placeholder="Re-enter new password" />
            {newPwConfirm.length > 0 && newPw !== newPwConfirm && <p className="mt-1 text-[11px] text-red-600">Passwords do not match</p>}
          </div>
        </div>
        <button onClick={changeMyPassword} disabled={changingPw} className="btn-primary mt-4">
          {changingPw ? 'Updating…' : 'Update Password'}
        </button>
      </div>

      <Modal
        open={!!resetUser}
        onClose={() => !resetting && setResetUser(null)}
        title={`Reset password${resetUser ? ` — ${resetUser.name}` : ''}`}
        footer={
          <>
            <button onClick={() => setResetUser(null)} disabled={resetting} className="btn-secondary btn-sm">
              Cancel
            </button>
            <button onClick={submitReset} disabled={resetting} className="btn-primary btn-sm">
              {resetting ? 'Resetting…' : 'Reset Password'}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          Set a new password for <span className="font-medium">{resetUser?.email}</span>. Their existing sessions will be signed out.
        </p>
        <input
          value={resetPw}
          onChange={(e) => setResetPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitReset()}
          className="input"
          type="text"
          autoFocus
          placeholder={PASSWORD_HINT}
        />
        {resetPw.length > 0 && !isStrongPassword(resetPw) && <p className="mt-1 text-[11px] text-amber-600">{PASSWORD_HINT}</p>}
      </Modal>
    </div>
  );
}

function errText(err: any): string | undefined {
  const e = err?.response?.data?.error;
  if (typeof e === 'string') return e;
  if (e?.formErrors?.length) return e.formErrors[0];
  if (e?.fieldErrors) {
    const first = Object.values(e.fieldErrors).flat()[0];
    if (typeof first === 'string') return first;
  }
  return undefined;
}

function SectionTitle({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-600">{icon}</span>
        {title}
      </h2>
      {hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
