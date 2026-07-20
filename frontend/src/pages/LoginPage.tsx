import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import { Eye, EyeOff, IndianRupee, ReceiptText, GitBranch, Wallet, LoaderCircle } from 'lucide-react';
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

export default function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

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
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading && <LoaderCircle size={15} className="animate-spin" />}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Forgot your password? Contact your administrator to reset it.
          </p>
        </div>
      </div>
    </div>
  );
}
