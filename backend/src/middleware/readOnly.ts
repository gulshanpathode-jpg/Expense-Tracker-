import { Request, Response, NextFunction } from 'express';

// ACCOUNTS is a read-only role per spec: it can view everything but
// cannot create, edit, approve, reject, or delete anything.
export function blockReadOnly(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'ACCOUNTS') {
    return res.status(403).json({ error: 'Accounts role has read-only access' });
  }
  next();
}
