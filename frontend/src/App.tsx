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
import PurchaseRequestsPage from './pages/PurchaseRequestsPage';
import PurchaseRequestDetailPage from './pages/PurchaseRequestDetailPage';
import PurchaseOrdersPage from './pages/PurchaseOrdersPage';
import PurchaseOrderDetailPage from './pages/PurchaseOrderDetailPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return <Navigate to="/login" replace />;
  return <>{children}</>;
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
          <Route index element={<DashboardPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="expenses/new" element={<NewExpensePage />} />
          <Route path="expenses/:id" element={<ExpenseDetailPage />} />
          <Route path="expenses/:id/edit" element={<NewExpensePage />} />
          <Route path="purchases" element={<PurchaseRequestsPage />} />
          <Route path="purchases/requests/:id" element={<PurchaseRequestDetailPage />} />
          <Route path="purchases/orders" element={<PurchaseOrdersPage />} />
          <Route path="purchases/orders/:id" element={<PurchaseOrderDetailPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="admin/audit-log" element={<AuditLogPage />} />
          <Route path="admin/masters" element={<AdminMastersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
