import type { Request } from 'express';
import { prisma, type Tx } from '../config/db';
import { logger } from '../config/logger';

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  changes?: unknown;
  /** Overrides req.user (e.g. during login, before req.user is set). */
  actorId?: string;
}

/** Records a sensitive action. Never throws (audit failures are logged, not surfaced). */
export async function audit(req: Request | null, input: AuditInput, tx: Tx = prisma) {
  try {
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? req?.user?.id ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary ?? '',
        changes: input.changes === undefined ? undefined : JSON.parse(JSON.stringify(input.changes)),
        ip: req?.ip ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, input }, 'audit log failed');
  }
}

/** Shallow diff of changed fields, for audit entries. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    const a = JSON.stringify(before[k] ?? null);
    const b = JSON.stringify(after[k] ?? null);
    if (a !== b) out[k] = { from: before[k] ?? null, to: after[k] ?? null };
  }
  return out;
}
