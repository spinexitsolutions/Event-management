import { Prisma, PrismaClient } from '@prisma/client';

/**
 * MongoDB note: an optional field that is never written is *absent* from the document, and Prisma's
 * `{ field: null }` filter does not match absent fields. To keep null semantics identical to SQL, every create
 * (including nested creates) explicitly writes `null` for optional scalar fields that were not provided.
 */
type FieldInfo = { name: string; kind: string; isRequired: boolean; isList: boolean; type: string; hasDefaultValue: boolean };
const MODELS = new Map<string, FieldInfo[]>(Prisma.dmmf.datamodel.models.map((m) => [m.name, m.fields as unknown as FieldInfo[]]));

function fillNulls(model: string, data: unknown): unknown {
  if (Array.isArray(data)) return data.map((d) => fillNulls(model, d));
  if (!data || typeof data !== 'object') return data;
  const fields = MODELS.get(model);
  if (!fields) return data;
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const f of fields) {
    if (f.kind === 'scalar' && !f.isRequired && !f.isList && !f.hasDefaultValue && !(f.name in out)) {
      // Skip FK scalars whose relation object is being written instead (e.g. `client: { connect }`).
      const viaRelation = fields.some((r) => r.kind === 'object' && (r as unknown as { relationFromFields?: string[] }).relationFromFields?.includes(f.name) && r.name in out);
      if (!viaRelation) out[f.name] = null;
    }
    if (f.kind === 'object' && out[f.name] && typeof out[f.name] === 'object') {
      const nested = { ...(out[f.name] as Record<string, unknown>) };
      if (nested.create) nested.create = fillNulls(f.type, nested.create);
      if (nested.createMany && typeof nested.createMany === 'object') {
        const cm = nested.createMany as { data?: unknown };
        nested.createMany = { ...cm, data: fillNulls(f.type, cm.data) };
      }
      if (Array.isArray(nested.connectOrCreate) || (nested.connectOrCreate && typeof nested.connectOrCreate === 'object')) {
        const list = Array.isArray(nested.connectOrCreate) ? nested.connectOrCreate : [nested.connectOrCreate];
        const mapped = list.map((c: { create?: unknown }) => ({ ...c, create: fillNulls(f.type, c.create) }));
        nested.connectOrCreate = Array.isArray(nested.connectOrCreate) ? mapped : mapped[0];
      }
      out[f.name] = nested;
    }
  }
  return out;
}

const base = new PrismaClient({ log: ['warn', 'error'] });

export const prisma = base.$extends({
  name: 'mongo-explicit-nulls',
  query: {
    $allModels: {
      async create({ model, args, query }) {
        args.data = fillNulls(model, args.data) as typeof args.data;
        return query(args);
      },
      async createMany({ model, args, query }) {
        args.data = fillNulls(model, args.data) as typeof args.data;
        return query(args);
      },
      async upsert({ model, args, query }) {
        args.create = fillNulls(model, args.create) as typeof args.create;
        return query(args);
      },
    },
  },
});

export type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;
export { Prisma };

/** BigInt fields are serialised as plain numbers in JSON (amounts stay well below 2^53). */
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
  return Number(this);
};

const isWriteConflict = (e: unknown) => {
  const err = e as { code?: string; message?: string };
  return err?.code === 'P2034' || /write ?conflict|TransientTransactionError|please retry your transaction/i.test(err?.message ?? '');
};

/**
 * Interactive MongoDB transaction with automatic retry on write conflicts.
 * MongoDB uses snapshot isolation: when two transactions modify the same document, one aborts with a
 * write conflict and is retried here against the fresh state — the guarantee `SELECT … FOR UPDATE` gave in SQL.
 */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>, attempts = 8): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await prisma.$transaction((tx) => fn(tx as Tx), { maxWait: 10_000, timeout: 20_000 });
    } catch (e) {
      if (!isWriteConflict(e) || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 15 * i + Math.random() * 40));
    }
  }
}

type Lockable = 'role' | 'quotation' | 'booking' | 'payment' | 'resource' | 'venue' | 'task' | 'guest';

/**
 * "Locks" documents inside a transaction by bumping their `lockVersion`. Any concurrent transaction that
 * touches the same document hits a write conflict and is retried by `withTx`. Returns the number matched.
 * Call it FIRST in the transaction, before reading the state you depend on.
 */
export async function lockRows(tx: Tx, model: Lockable, where: Record<string, unknown>): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await (tx as any)[model].updateMany({ where, data: { lockVersion: { increment: 1 } } });
  return r.count as number;
}
