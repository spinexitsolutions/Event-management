/** RFC 4180 CSV with formula-injection protection (cells starting with = + - @ are prefixed with '). */
export function toCsv(rows: Record<string, unknown>[], columns?: { key: string; label: string }[]) {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]).map((k) => ({ key: k, label: k })) : []);
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => cell(c.label)).join(','), ...rows.map((r) => cols.map((c) => cell(r[c.key])).join(','))].join('\r\n');
}
