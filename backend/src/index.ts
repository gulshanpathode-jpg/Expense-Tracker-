import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth';
import masterRoutes from './routes/masters';
import budgetRoutes from './routes/budgets';
import expenseRoutes from './routes/expenses';
import dashboardRoutes from './routes/dashboard';
import notificationRoutes from './routes/notifications';
import auditLogRoutes from './routes/auditLog';
import purchaseRoutes from './routes/purchases';
import reportRoutes from './routes/reports';
import { startAutomationJobs } from './lib/automation';

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));

// Restrict CORS to known origins via CORS_ORIGIN (comma-separated). Unset = allow all (dev).
const corsOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: corsOrigins.length > 0 ? corsOrigins : true, credentials: true }));

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// NOTE: uploaded files are intentionally NOT served statically. Attachments are
// downloaded through authenticated, access-checked API endpoints instead.

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api', masterRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/reports', reportRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (err?.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 10MB)' : 'File upload failed';
    return res.status(400).json({ error: message });
  }
  const status = err.status || 500;
  // Never leak internal error details on unexpected failures.
  const message = status < 500 ? err.message || 'Request failed' : 'Internal server error';
  res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
startAutomationJobs();
