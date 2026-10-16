/** Small pure helpers shared by the CMS screens. */

export function slugify(s: string, max = 80): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

export function getAt(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** Immutable set at a dotted path (creates missing objects). */
export function setAt<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const root: Record<string, unknown> = Array.isArray(obj) ? ([...obj] as unknown as Record<string, unknown>) : { ...(obj as Record<string, unknown>) };
  let cur = root;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) cur[k] = value;
    else {
      const child = cur[k];
      const copy = Array.isArray(child) ? [...child] : child && typeof child === 'object' ? { ...(child as object) } : {};
      cur[k] = copy;
      cur = copy as Record<string, unknown>;
    }
  });
  return root as T;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Fills keys missing in `value` from `base` (deep for plain objects). Arrays and present values are kept. */
export function fillMissing<T>(value: unknown, base: T): T {
  if (!isObj(value) || !isObj(base)) return (value === undefined ? base : value) as T;
  const out: Record<string, unknown> = { ...value };
  for (const [k, v] of Object.entries(base)) out[k] = k in value ? (isObj(v) ? fillMissing(value[k], v) : value[k]) : v;
  return out as T;
}

export function formatBytes(n: number): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Groups zod-like issues `{path, message}` into a map keyed by path. */
export function issuesToMap(issues: { path: string; message: string }[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues ?? []) if (!(i.path in out)) out[i.path] = i.message;
  return out;
}

/** Finds the first error at or below `prefix` (e.g. "brand" matches "brand.name"). */
export function errorUnder(errors: Record<string, string>, prefix: string): string | undefined {
  if (errors[prefix]) return errors[prefix];
  const k = Object.keys(errors).find((p) => p.startsWith(`${prefix}.`));
  return k ? errors[k] : undefined;
}

export const isHttpsOrLocal = (v: string) => v === '' || /^(\/(?!\/)|https:\/\/)/i.test(v);

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Public URL of a CMS page. */
export const publicPath = (p: { kind: string; slug: string }) => (p.kind === 'HOME' ? '/' : p.kind === 'ABOUT' ? '/about' : p.kind === 'CONTACT' ? '/contact' : `/${p.slug}`);

/** Friendlier wording for common zod messages. */
export function prettyIssue(message: string): string {
  if (/^String must contain at least 1 character/.test(message) || message === 'Required') return 'This is required';
  const min = message.match(/^Array must contain at least (\d+) element/);
  if (min) return `Add at least ${min[1]} item${min[1] === '1' ? '' : 's'}`;
  const max = message.match(/^String must contain at most (\d+) character/);
  if (max) return `Keep this under ${max[1]} characters`;
  if (/^Invalid enum value/.test(message)) return 'Choose one of the available options';
  if (/^Expected number/.test(message)) return 'Enter a number';
  return message;
}
