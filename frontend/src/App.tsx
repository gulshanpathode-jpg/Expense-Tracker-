import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import ExpensesPage from './pages/ExpensesPage';
import NewExpensePage from './pages/NewExpensePage';
import ExpenseDetailPage from './pages/ExpenseDetailPage';
import AdminMastersPage from './pages/AdminMastersPage';
import AuditLogPage from './pages/AuditLogPage';
import ReportsPage from './pages/ReportsPage';
import ProfilePage from './pages/ProfilePage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Restricts a route to the given roles; anyone else is sent home.
function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// The landing page depends on role: employees have no dashboard, so they go
// straight to their expenses.
function HomeRoute() {
  const user = useAuthStore((s) => s.user);
  if (user?.role === 'EMPLOYEE') return <Navigate to="/expenses" replace />;
  return <DashboardPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-right" />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomeRoute />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="expenses/new" element={<NewExpensePage />} />
          <Route path="expenses/:id" element={<ExpenseDetailPage />} />
          <Route path="expenses/:id/edit" element={<NewExpensePage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route
            path="reports"
            element={
              <RequireRole roles={['ADMIN', 'DEPARTMENT_HEAD', 'OWNER']}>
                <ReportsPage />
              </RequireRole>
            }
          />
          <Route
            path="admin/audit-log"
            element={
              <RequireRole roles={['ADMIN']}>
                <AuditLogPage />
              </RequireRole>
            }
          />
          <Route
            path="admin/masters"
            element={
              <RequireRole roles={['ADMIN']}>
                <AdminMastersPage />
              </RequireRole>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
