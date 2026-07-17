import { prisma } from './prisma';

export async function writeAudit(
  userId: string | null,
  action: string,
  entityType: string,
  entityId?: string,
  oldValue?: unknown,
  newValue?: unknown,
  ip?: string,
) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      oldValue: oldValue === undefined ? undefined : (oldValue as any),
      newValue: newValue === undefined ? undefined : (newValue as any),
      ip,
    },
  });
}
