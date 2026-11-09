export type CourtBookingInterval = {
  starts_at: string;
  ends_at: string;
  court_id?: string;
};

export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && aEnd > bStart;
}
