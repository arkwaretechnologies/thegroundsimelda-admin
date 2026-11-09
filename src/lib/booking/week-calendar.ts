const MANILA = "Asia/Manila";

/** Monday-based week start in Manila (YYYY-MM-DD). */
export function manilaWeekStartKey(anchor: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(anchor);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const utc = new Date(Date.UTC(y, m - 1, d, 12));
  const w = utc.getUTCDay();
  const daysFromMonday = (w + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - daysFromMonday);
  return utc.toISOString().slice(0, 10);
}

export function buildWeekDayKeys(weekStartKey: string): string[] {
  const [y, m, d] = weekStartKey.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 12));
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    keys.push(day.toISOString().slice(0, 10));
  }
  return keys;
}

export function shiftWeekStartKey(weekStartKey: string, deltaWeeks: number): string {
  const [y, m, d] = weekStartKey.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 12));
  start.setUTCDate(start.getUTCDate() + deltaWeeks * 7);
  return start.toISOString().slice(0, 10);
}

export function formatExclusiveHourLabel(hour24: number): string {
  if (hour24 === 0 || hour24 === 24) return "12:00 AM";
  if (hour24 === 12) return "12:00 PM";
  if (hour24 < 12) return `${hour24}:00 AM`;
  return `${hour24 - 12}:00 PM`;
}
