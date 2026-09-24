import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "./db";

export async function audit(
  entry: { actorId: string | null; action: string; entityType: string; entityId?: string | null; summary: string; metadata?: Record<string, unknown>; ipHash?: string | null },
  db: Tx = prisma,
) {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary.slice(0, 500),
      metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      ipHash: entry.ipHash ?? null,
    },
  });
}
