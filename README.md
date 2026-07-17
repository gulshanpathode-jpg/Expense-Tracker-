# Engage360 — Expense Management (MVP)

A first-pass core slice of the full Expense Management spec: auth + RBAC, expense entry with duplicate detection, standard budget auto-allocation, a multi-level approval workflow (Employee → Manager → Department Head), and dashboards.

Not yet built (later passes): vendor/PO management, notifications, reports/export, audit log, additional dashboards (dedicated, Accounts, Client), multi-currency, dark mode.

## Stack

- **Backend:** Node.js, Express 5, TypeScript, Prisma 5, PostgreSQL, JWT auth
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS v4, Zustand, React Router
- **Process manager:** PM2 (`ecosystem.config.js`), apps named `exptrack-backend` / `exptrack-frontend`

## Setup

### 1. Database

A local PostgreSQL 16 instance is expected. Create the app role/database (already done in this environment):

```sql
CREATE USER exptrack WITH PASSWORD 'exptrack_dev_pw' CREATEDB;
CREATE DATABASE exptrack_dev OWNER exptrack;
```

Note: an earlier `exptrack` database also exists from initial setup and still has the same schema/seed applied — either works, but `exptrack_dev` is what `.env.example` points at.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env   # adjust DATABASE_URL / secrets / PORT if needed
npm run prisma:migrate # applies schema
npm run prisma:seed    # seeds budget heads, categories, demo users
npm run dev             # starts API on PORT (default 8002)
```

Demo logins (password `Passw0rd!` for all):
- `admin@exptrack.local` — Admin
- `depthead@exptrack.local` — Department Head (Engineering)
- `manager@exptrack.local` — Manager (Engineering, reports to depthead)
- `employee@exptrack.local` — Employee (Engineering, reports to manager)
- `accounts@exptrack.local` — Accounts

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_URL to match backend host/PORT
npm run dev -- --port 8004 --host 0.0.0.0
```

Visit `http://<server-ip>:8004`.

### 4. Running both under PM2 (recommended for a persistent server)

```bash
cd /root/exp-track
pm2 start ecosystem.config.js
pm2 save
```

This registers `exptrack-backend` (port 8002) and `exptrack-frontend` (port 8004, bound to all interfaces). Useful commands:

```bash
pm2 status
pm2 logs exptrack-backend
pm2 logs exptrack-frontend
pm2 restart exptrack-backend exptrack-frontend
```

Note: if this server already runs other PM2 apps, double-check names don't collide before running `pm2 restart <name>` — this project deliberately avoids the generic names `backend`/`frontend`.

## Notes

- Standard budgets: creating a department budget (Admin Setup page) auto-distributes the annual amount across the 10 standard budget heads proportionally to their configured percentages (normalized by the percentage total), and splits evenly across 12 months. Revising a budget re-distributes the per-head allocations.
- Approval workflow: submitting an expense builds an approver chain from the submitter's manager (level 1) and their department's Department Head (level 2). If neither exists, an active Admin is used as fallback approver. Budget utilization updates only once an expense reaches full approval, and is reversed if an admin deletes an approved expense.
- File uploads are stored on local disk under `backend/uploads` (swap for S3/MinIO in production). Files are **not** served publicly — attachments and PO quotations are downloaded through authenticated, access-checked endpoints (`GET /api/expenses/attachments/:id`, `GET /api/purchases/orders/:id/quotation`).
- Auth: refresh tokens are stored (hashed) server-side, rotated on every refresh, and revoked on logout, password change, or user deactivation. Login is rate-limited (10 attempts / 15 min per IP+email). Set `CORS_ORIGIN` in production to lock CORS to your frontend origin.
- User management (Admin only, API): `POST /api/users`, `PUT /api/users/:id`, `POST /api/users/:id/reset-password`; users can change their own password via `POST /api/auth/change-password`.
