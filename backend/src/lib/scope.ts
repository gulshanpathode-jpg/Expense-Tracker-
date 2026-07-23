import { prisma } from './prisma';

export interface OwnerScope {
  headIds: string[];
  departmentIds: string[];
}

// The heads (and their departments) a portfolio owner (OWNER role) oversees.
// An owner's portfolio can span multiple departments, so expense/budget/report
// scope keys on headIds while purchase scope keys on departmentIds. Computed
// per-request rather than baked into the JWT so ownership changes take effect
// without waiting for the 15-minute access token to expire.
export async function ownerScope(userId: string): Promise<OwnerScope> {
  const heads = await prisma.departmentHead.findMany({
    where: { ownerId: userId, isActive: true },
    select: { id: true, departmentId: true },
  });
  return {
    headIds: heads.map((h) => h.id),
    departmentIds: [...new Set(heads.map((h) => h.departmentId))],
  };
}
