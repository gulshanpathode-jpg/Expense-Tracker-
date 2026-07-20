# ExpTrack (Engage360) — Project Context

Internal expense-tracking app for Engage360 / dhaninfo.biz. INR-only. Last updated: 2026-07-20.

## Stack

- **Frontend**: React + Vite + TypeScript, Tailwind, Zustand (persisted auth store), react-router, sonner toasts. Lives in `frontend/`.
- **Backend**: Express 5 + TypeScript, Prisma + PostgreSQL (Docker locally), Zod validation, JWT access tokens + rotated/revocable refresh tokens (hashed in DB). Lives in `backend/`.
- **Uploads**: expense attachments stored on disk under `uploads/`.

## Domain model (post 2026-07 revamp)

- Approval workflows were **removed** — expenses are drafts until SUBMITTED; aggregates count only SUBMITTED.
- Budgets are **per department head** (`DepartmentHead`), not per department. A DEPARTMENT_HEAD user is linked to a head record (`deptHeadId` in the JWT scopes them to their slice).
- Roles: `ADMIN`, `DEPARTMENT_HEAD`, `EMPLOYEE`. Admin-only: user management, audit log, masters, expense delete.

## Authentication & password management

**Decision (2026-07-20): the email-based forgot-password flow is disabled until SendGrid is set up.** The backend endpoints (`/auth/forgot-password`, `/auth/reset-password`) and the mailer stub still exist but are not reachable from the UI.

How passwords are managed instead:

1. **Signed-in users** change their own password on the **Profile page** (`/profile`, reachable by clicking the user block at the bottom of the sidebar). Calls `POST /auth/change-password` — requires the current password, enforces the shared policy (8+ chars, letter + number), revokes all other sessions, and keeps the current session alive via a fresh refresh token.
2. **User forgets their password before signing in** → they ask an **admin**, who resets it from Admin Setup → Users ("Reset password" action, `POST /users/:id/reset-password`, audited).
3. **Admin forgets their own password** (recovery of last resort) → whoever has shell access to the server runs:

   ```
   cd backend
   npm run reset:password -- admin@dhaninfo.biz NewPass123
   ```

   (`backend/scripts/reset-password.ts` — updates the hash and revokes all of that user's sessions.) Alternative safeguard: keep a second ADMIN account so admins can reset each other in-app.

When SendGrid is configured, re-enabling self-serve reset is just restoring the "Forgot password?" flow on `LoginPage.tsx` (see git history) — the backend code-based flow (6-digit code, 10-min TTL, 5 attempts) is already in place.

Other auth conventions:

- Login is rate-limited in-memory per IP+email (10 attempts / 15 min).
- Refresh tokens are stored hashed, rotated on every use, and revocable; password changes/resets revoke all outstanding tokens.
- Password policy lives in `backend/src/lib/password.ts` and is shared by every endpoint that sets a password.

## Running locally (Windows)

1. `docker compose up -d` (Postgres)
2. `cd backend && npm run dev` (Express on :4000)
3. `cd frontend && npm run dev` (Vite on :5173, `VITE_API_URL` points at the backend)

Seed data (`backend/prisma/seed.ts`) creates real dhaninfo.biz department heads and an `Admin` user.
