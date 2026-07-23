export type PaymentMode = 'CREDIT_CARD' | 'DEBIT_CARD' | 'UPI' | 'BANK_TRANSFER' | 'PAYPAL' | 'CASH' | 'CHEQUE' | 'OTHERS';

export interface Department {
  id: string;
  code: string | null;
  name: string;
  isActive: boolean;
  heads?: DepartmentHead[];
}

export interface DepartmentHead {
  id: string;
  name: string;
  departmentId: string;
  userId: string | null;
  isActive: boolean;
  // When set, expenses for this head may only use this category.
  restrictedCategoryId: string | null;
  // Portfolio owner (OWNER role) overseeing this head, if any.
  ownerId?: string | null;
  owner?: { id: string; name: string } | null;
}

export interface CostCenter {
  id: string;
  name: string;
  departmentId: string | null;
}

export interface AccountsCategory {
  id: string;
  code: string;
  label: string;
  budgetAmount: number;
  isActive: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  gstNo?: string | null;
  email?: string | null;
}

export interface FinancialYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
  isActive: boolean;
}

export interface ExpenseAttachment {
  id: string;
  fileName: string;
  fileType: string;
  filePath: string;
}

export type ExpenseStatus = 'DRAFT' | 'SUBMITTED';

export interface Expense {
  id: string;
  userId: string;
  departmentId: string;
  deptHeadId: string | null;
  vendorId: string | null;
  categoryId: string;
  status: ExpenseStatus;
  invoiceNo: string | null;
  invoiceDate: string;
  amount: number;
  currency: string;
  gstAmount: number | null;
  paymentMode: PaymentMode;
  paymentDetails: string | null;
  description: string | null;
  createdAt: string;
  vendor?: Vendor | null;
  category?: AccountsCategory;
  department?: Department;
  deptHead?: DepartmentHead | null;
  user?: { id: string; name: string; email: string };
  attachments: ExpenseAttachment[];
}

export interface Budget {
  id: string;
  departmentId: string;
  deptHeadId: string | null;
  fyId: string;
  annualAmount: number;
  department?: Department;
  deptHead?: DepartmentHead | null;
  financialYear?: FinancialYear;
  totalUtilized?: number;
  totalRemaining?: number;
  utilizationPct?: number;
  expenseCount?: number;
}

export interface DashboardSummary {
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  utilizationPct: number;
  expenseCount: number;
  avgExpense: number;
  monthlySpend: number;
  departmentStats: DepartmentStat[];
  categoryStats: {
    categoryId: string;
    name: string;
    budget: number;
    spent: number;
    remaining: number;
    pct: number;
    count: number;
  }[];
  monthlyTrend: { month: string; amount: number }[];
}

export interface DepartmentHeadStat {
  deptHeadId: string | null;
  name: string;
  allocated: number;
  spent: number;
  remaining: number;
  pct: number;
  count: number;
}

export interface DepartmentStat {
  departmentId: string;
  name: string;
  allocated: number;
  spent: number;
  remaining: number;
  pct: number;
  count: number;
  heads: DepartmentHeadStat[];
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ip: string | null;
  timestamp: string;
  user: { id: string; name: string; email: string } | null;
}

export type PurchaseRequestStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type PurchaseOrderStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_DELIVERED' | 'DELIVERED' | 'CLOSED' | 'CANCELLED';

export interface PurchaseRequestItem {
  id: string;
  description: string;
  quantity: number;
  estimatedUnitCost: number;
}

export interface PurchaseRequest {
  id: string;
  requestedBy: { id: string; name: string; email: string };
  department: Department;
  costCenter: CostCenter | null;
  title: string;
  justification: string | null;
  estimatedAmount: number;
  status: PurchaseRequestStatus;
  approver: { id: string; name: string } | null;
  approvedAt: string | null;
  comments: string | null;
  items: PurchaseRequestItem[];
  purchaseOrders: PurchaseOrder[];
  createdAt: string;
}

export interface PurchaseOrderDelivery {
  id: string;
  deliveredAmount: number;
  note: string | null;
  deliveredAt: string;
  recordedBy: { id: string; name: string };
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  purchaseRequestId: string | null;
  purchaseRequest?: PurchaseRequest | null;
  vendor: Vendor;
  department: Department;
  amount: number;
  status: PurchaseOrderStatus;
  quotationFilePath: string | null;
  quotationFileName: string | null;
  invoiceExpenseId: string | null;
  invoiceExpense?: Expense | null;
  createdBy: { id: string; name: string };
  issuedAt: string | null;
  deliveries: PurchaseOrderDelivery[];
  createdAt: string;
}
