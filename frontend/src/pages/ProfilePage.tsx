import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { KeyRound, LoaderCircle, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { api } from '../api/client';
import { PageHeader, Field, Avatar } from '../components/ui';
import { titleCase } from '../lib/format';

const PASSWORD_RULE = 'At least 8 characters, with a letter and a number';

function isStrongPassword(value: string): boolean {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!currentPassword) {
      toast.error('Enter your current password');
      return;
    }
    if (!isStrongPassword(newPassword)) {
      toast.error(PASSWORD_RULE);
      return;
    }
    if (newPassword === currentPassword) {
      toast.error('New password must be different from the current one');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      const res = await api.post('/auth/change-password', { currentPassword, newPassword });
      // The server revokes every refresh token and hands back a fresh one so
      // this session stays signed in while all others are logged out.
      if (res.data?.refreshToken) {
        useAuthStore.setState({ refreshToken: res.data.refreshToken });
      }
      toast.success('Password updated. Other devices have been signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Could not update the password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <PageHeader title="My Profile" subtitle="Your account details and password." />

      <div className="card mb-6 p-5">
        <div className="flex items-center gap-4">
          <Avatar name={user.name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            {titleCase(user.role)}
          </span>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound size={15} className="text-slate-400" />
          <h2 className="card-title">Change password</h2>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Field label="Current password" required>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                aria-label={showCurrent ? 'Hide password' : 'Show password'}
              >
                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>

          <Field label="New password" required hint={PASSWORD_RULE}>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                aria-label={showNew ? 'Hide password' : 'Show password'}
              >
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>

          <Field label="Confirm new password" required>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="mt-1 text-[11px] text-red-600">Passwords do not match</p>
            )}
          </Field>

          <div className="flex justify-end pt-1">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving && <LoaderCircle size={15} className="animate-spin" />}
              {saving ? 'Updating...' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
