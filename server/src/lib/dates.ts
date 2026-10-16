/** Date-only helpers. Event dates are stored as DATE (no time zone); we use UTC midnight in JS. */
export const toDateOnly = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
export const isoDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};
export const startOfDayUtc = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
