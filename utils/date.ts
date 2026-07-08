/**
 * Local-date helpers.
 *
 * The app previously used `new Date().toISOString().split('T')[0]` everywhere,
 * which yields the UTC date. For users in negative-offset timezones an evening
 * entry landed on "tomorrow"; in positive offsets an early-morning entry landed
 * on "yesterday". That corrupted daily totals, streaks and week stats.
 *
 * These helpers always work in the device's LOCAL timezone.
 */

/** Format a Date as a local `YYYY-MM-DD` string (no UTC shift). */
export const toDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Today's date as a local `YYYY-MM-DD` string. */
export const todayStr = (): string => toDateStr(new Date());

/** Parse a `YYYY-MM-DD` string into a Date at LOCAL midnight (not UTC). */
export const parseDateStr = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** A local `YYYY-MM-DD` string offset by `days` from today (negative = past). */
export const dateStrOffset = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateStr(d);
};
