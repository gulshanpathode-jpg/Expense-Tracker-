import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import { Eye, EyeOff, IndianRupee, ReceiptText, GitBranch, Wallet, LoaderCircle, ArrowLeft, MailCheck } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { FieldError } from '../components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FEATURES = [
  {
    icon: ReceiptText,
    title: 'Every bill, in one place',
    text: 'Attach invoices and receipts to each expense so nothing goes unaccounted.',
  },
  {
    icon: GitBranch,
    title: 'Accountability by head',
    text: 'Each department head tracks the spend and budget for their own slice.',
  },
  {
    icon: Wallet,
    title: 'Budgets kept up to date',
    text: 'Annual budgets split across heads, with utilisation updated on every expense.',
  },
];

const DEMO_PASSWORD = 'Dhaninfo@2026';

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@dhaninfo.biz' },
  { label: 'Dept Head', email: 'vikas@dhaninfo.biz' },
  { label: 'Employee', email: 'employee@dhaninfo.biz' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('admin@dhaninfo.biz');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // 'login' → normal sign-in; 'forgot' → request a code; 'reset' → enter code + new password.
  const [view, setView] = useState<'login' | 'forgot' | 'reset'>('login');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  async function requestResetCode(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(resetEmail.trim())) {
      toast.error('Enter a valid email address');
      return;
    }
    setResetLoading(true);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/auth/forgot-password`, { email: resetEmail.trim() });
      toast.success('If that email exists, a verification code is on its way');
      setView('reset');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Could not send the code. Try again.');
    } finally {
      setResetLoading(false);
    }
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(resetCode.trim())) {
      toast.error('Enter the 6-digit code from the email');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setResetLoading(true);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/auth/reset-password`, {
        email: resetEmail.trim(),
        code: resetCode.trim(),
        newPassword,
      });
      toast.success('Password updated — sign in with your new password');
      setEmail(resetEmail.trim());
      setPassword('');
      setResetCode('');
      setNewPassword('');
      setConfirmPassword('');
      setView('login');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Could not reset the password');
    } finally {
      setResetLoading(false);
    }
  }

  function validate() {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = 'Enter your email address';
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address';
    if (!password) next.password = 'Enter your password';
    return next;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const found = validate();
    setErrors(found);
    if (found.email) return emailRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();

    setLoading(true);
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/auth/login`, { email, password });
      setSession(res.data.accessToken, res.data.refreshToken, res.data.user);
      toast.success(`Welcome back, ${res.data.user.name}`);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-sidebar p-10 text-slate-300 lg:flex">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(600px 400px at 20% -10%, rgb(79 70 229 / 0.35), transparent 60%), radial-gradient(500px 350px at 90% 110%, rgb(67 56 202 / 0.25), transparent 60%)',
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_0_20px_rgb(99_102_241/0.5)]">
            <IndianRupee size={18} strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <span className="block text-base font-semibold tracking-tight text-white">ExpTrack</span>
            <span className="block text-[10px] font-medium tracking-wider text-slate-500 uppercase">Engage360</span>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-white">
            From bill to approval, in one place.
          </h1>
          <div className="mt-8 space-y-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-brand-300 ring-1 ring-white/10">
                  <f.icon size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{f.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-slate-400">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-600">Engage360 Expense Management</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-page px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
              <IndianRupee size={18} strokeWidth={2.5} />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">ExpTrack</h1>
          </div>

          {view === 'forgot' && (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">Reset your password</h2>
              <p className="mt-1 mb-7 text-sm text-slate-500">
                Enter your account email and we'll send a 6-digit verification code.
              </p>
              <form onSubmit={requestResetCode} noValidate className="space-y-4">
                <div>
                  <label className="label" htmlFor="reset-email">Email</label>
                  <input
                    id="reset-email"
                    type="email"
                    autoFocus
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="input"
                    placeholder="you@company.com"
                  />
                </div>
                <button type="submit" disabled={resetLoading} className="btn-primary w-full py-2.5">
                  {resetLoading ? <LoaderCircle size={15} className="animate-spin" /> : <MailCheck size={15} />}
                  {resetLoading ? 'Sending code...' : 'Send verification code'}
                </button>
                <button
                  type="button"
                  onClick={() => setView('login')}
                  className="mx-auto flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
                >
                  <ArrowLeft size={14} />
                  Back to sign in
                </button>
              </form>
            </>
          )}

          {view === 'reset' && (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">Enter the code</h2>
              <p className="mt-1 mb-7 text-sm text-slate-500">
                We sent a 6-digit code to <span className="font-medium text-slate-700">{resetEmail}</span>. It expires in 10 minutes.
              </p>
              <form onSubmit={submitReset} noValidate className="space-y-4">
                <div>
                  <label className="label" htmlFor="reset-code">Verification code</label>
                  <input
                    id="reset-code"
                    inputMode="numeric"
                    autoFocus
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                    className="input num tracking-[0.4em]"
                    placeholder="000000"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="reset-new-password">New password</label>
                  <input
                    id="reset-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input"
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="reset-confirm-password">Confirm new password</label>
                  <input
                    id="reset-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input"
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                  />
                  {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                    <p className="mt-1 text-[11px] text-red-600">Passwords do not match</p>
                  )}
                </div>
                <button type="submit" disabled={resetLoading} className="btn-primary w-full py-2.5">
                  {resetLoading && <LoaderCircle size={15} className="animate-spin" />}
                  {resetLoading ? 'Updating password...' : 'Update password'}
                </button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => setView('forgot')}
                    className="flex items-center gap-1.5 font-medium text-slate-500 hover:text-slate-900"
                  >
                    <ArrowLeft size={14} />
                    Change email
                  </button>
                  <button
                    type="button"
                    onClick={(e) => requestResetCode(e as unknown as FormEvent)}
                    disabled={resetLoading}
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    Resend code
                  </button>
                </div>
              </form>
            </>
          )}

          {view === 'login' && (
            <>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1 mb-7 text-sm text-slate-500">Welcome back. Enter your details to continue.</p>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label className="label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                }}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                className="input"
                placeholder="you@company.com"
              />
              {errors.email && <FieldError id="login-email-error">{errors.email}</FieldError>}
            </div>
            <div>
              <label className="label" htmlFor="login-password">Password</label>
              <div className="relative">
                <input
                  id="login-password"
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                  }}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'login-password-error' : undefined}
                  className="input pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && <FieldError id="login-password-error">{errors.password}</FieldError>}
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <input type="checkbox" className="rounded border-slate-300 accent-brand-600" defaultChecked />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => {
                  setResetEmail(EMAIL_RE.test(email.trim()) ? email.trim() : '');
                  setView('forgot');
                }}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Forgot password?
              </button>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading && <LoaderCircle size={15} className="animate-spin" />}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="my-7 flex items-center gap-3 text-[11px] font-medium tracking-wider text-slate-400 uppercase">
            <span className="h-px flex-1 bg-slate-200" />
            Demo accounts
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="flex flex-wrap justify-center gap-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                  setErrors({});
                }}
                className={
                  email === a.email
                    ? 'badge bg-brand-600 text-white'
                    : 'badge cursor-pointer bg-white text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:text-slate-900'
                }
              >
                {a.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">Click a role to fill its credentials, then sign in.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
