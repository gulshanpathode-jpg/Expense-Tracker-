import { Request, Response, NextFunction } from 'express';

// ACCOUNTS is a fully read-only role: it can view everything but cannot create,
// edit, approve, reject, or delete anything. Used on expense write routes.
// (OWNER can file expenses within its portfolio, so it is NOT blocked here —
// portfolio scope is enforced inside the expense routes via lib/scope.ownerScope.)
export function blockReadOnly(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'ACCOUNTS') {
    return res.status(403).json({ error: 'Accounts role has read-only access' });
  }
  next();
}

// Purchases stay read-only for both ACCOUNTS and OWNER — owners oversee spend
// but do not raise purchase requests or orders.
export function blockReadOnlyOrOwner(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'ACCOUNTS' || req.user?.role === 'OWNER') {
    return res.status(403).json({ error: 'Your role has read-only access here' });
  }
  next();
}
