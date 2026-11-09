/** How the member app labels the last bookable exclusive hour (hour < closeHour). */
export function formatExclusiveHourLabel(hour24: number): string {
  if (hour24 === 0 || hour24 === 24) return "12:00 AM";
  if (hour24 === 12) return "12:00 PM";
  if (hour24 < 12) return `${hour24}:00 AM`;
  return `${hour24 - 12}:00 PM`;
}

export function lastExclusiveSlotStartHour(
  openHour: number,
  closeHour: number
): number | null {
  if (closeHour <= openHour) return null;
  return closeHour - 1;
}

export function validateExclusiveHours(openHour: number, closeHour: number) {
  if (!Number.isInteger(openHour) || openHour < 0 || openHour > 23) {
    return { ok: false as const, message: "Open hour must be 0–23" };
  }
  if (!Number.isInteger(closeHour) || closeHour < 1 || closeHour > 24) {
    return { ok: false as const, message: "Close hour must be 1–24" };
  }
  if (closeHour <= openHour) {
    return {
      ok: false as const,
      message: "Close hour must be after open hour",
    };
  }
  return { ok: true as const };
}
