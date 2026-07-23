import { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ReceiptText,
  CirclePlus,
  FileBarChart,
  ScrollText,
  Settings2,
  LogOut,
  IndianRupee,
  Menu,
  X,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { api } from '../api/client';
import clsx from 'clsx';
import NotificationBell from './NotificationBell';
import { Avatar } from './ui';
import { titleCase } from '../lib/format';

// Owners can now file expenses within their portfolio, so they share the spend roles.
const SPEND = ['ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE', 'OWNER']; // view + file expenses
const STAFF = ['ADMIN', 'DEPARTMENT_HEAD', 'OWNER']; // roles with reporting/dashboard access

const navSections: {
  heading: string | null;
  items: { to: string; label: string; end: boolean; roles: string[]; icon: typeof LayoutDashboard }[];
}[] = [
  {
    heading: null,
    items: [{ to: '/', label: 'Dashboard', end: true, roles: STAFF, icon: LayoutDashboard }],
  },
  {
    heading: 'Spend',
    items: [
      { to: '/expenses', label: 'Expenses', end: true, roles: SPEND, icon: ReceiptText },
      { to: '/expenses/new', label: 'Add Expense', end: true, roles: SPEND, icon: CirclePlus },
    ],
  },
  {
    heading: 'Insights',
    items: [
      { to: '/reports', label: 'Reports', end: true, roles: STAFF, icon: FileBarChart },
      { to: '/admin/audit-log', label: 'Audit Log', end: true, roles: ['ADMIN'], icon: ScrollText },
      { to: '/admin/masters', label: 'Admin Setup', end: true, roles: ['ADMIN'], icon: Settings2 },
    ],
  },
];

function BrandMark() {
  return (
    <>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_0_16px_rgb(99_102_241/0.45)]">
        <IndianRupee size={16} strokeWidth={2.5} />
      </div>
      <div className="leading-tight">
        <span className="block text-sm font-semibold tracking-tight text-white">ExpTrack</span>
        <span className="block text-[10px] font-medium tracking-wider text-slate-500 uppercase">Engage360</span>
      </div>
    </>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  if (!user) return null;

  const sections = navSections
    .map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(user.role)) }))
    .filter((s) => s.items.length > 0);

  return (
    <>
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
        <BrandMark />
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {sections.map((section, i) => (
          <div key={section.heading ?? i}>
            {section.heading && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                {section.heading}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    clsx(
                      'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                      isActive
                        ? 'bg-white/[0.08] text-white'
                        : 'text-slate-400 hover:bg-sidebar-hover hover:text-slate-100',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand-400" />
                      )}
                      <item.icon
                        size={16}
                        className={clsx(
                          'shrink-0 transition-colors',
                          isActive ? 'text-brand-300' : 'text-slate-500 group-hover:text-slate-300',
                        )}
                      />
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <Link
            to="/profile"
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md transition-colors hover:bg-sidebar-hover"
            title="My Profile"
          >
            <Avatar name={user.name} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-medium text-white">{user.name}</p>
              <p className="truncate text-[11px] text-slate-500">{titleCase(user.role)}</p>
            </div>
          </Link>
          <button
            onClick={() => {
              // Revoke the refresh token server-side; local state clears regardless.
              const { refreshToken } = useAuthStore.getState();
              if (refreshToken) api.post('/auth/logout', { refreshToken }).catch(() => {});
              logout();
              navigate('/login');
            }}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-sidebar-hover hover:text-red-400"
            title="Log out"
            aria-label="Log out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </>
  );
}

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-page">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-slate-300 lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar text-slate-300 shadow-pop">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 rounded-md p-1.5 text-slate-400 hover:bg-sidebar-hover hover:text-white"
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <div className="flex-1" />
          <NotificationBell />
        </div>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
