import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { TimeInterval, CourtRef } from "@/lib/booking/court-availability";

type Client = SupabaseClient<Database>;

export type CourtScheduleSnapshot = {
  branchId: string;
  courts: CourtRef[];
  bookings: TimeInterval[];
  blocks: TimeInterval[];
  openHour: number;
  closeHour: number;
  exclusiveFeeCents: number;
  openPlayFeeCents: number;
};

export async function fetchCourtScheduleSnapshot(
  client: Client,
  branchId: string,
  rangeStart?: Date,
  rangeEnd?: Date
): Promise<CourtScheduleSnapshot> {
  const now = rangeStart ?? new Date();
  const until = rangeEnd ?? new Date(now.getTime() + 8 * 86400000);

  const [courtsRes, busyRes, blocksRes, settingsRes] = await Promise.all([
    client
      .from("courts")
      .select("id, name")
      .eq("branch_id", branchId)
      .eq("is_exclusive", true)
      .eq("status", "available")
      .order("sort_order"),
    client
      .from("bookings")
      .select("court_id, starts_at, ends_at")
      .eq("branch_id", branchId)
      .eq("type", "exclusive")
      .eq("status", "confirmed")
      .gte("ends_at", now.toISOString())
      .lt("starts_at", until.toISOString()),
    client
      .from("court_schedule_blocks")
      .select("court_id, starts_at, ends_at")
      .eq("branch_id", branchId)
      .gte("ends_at", now.toISOString())
      .lt("starts_at", until.toISOString()),
    client
      .from("branch_settings")
      .select(
        "exclusive_open_hour, exclusive_close_hour, exclusive_court_fee_cents, default_open_play_fee_cents"
      )
      .eq("branch_id", branchId)
      .maybeSingle(),
  ]);

  const settings = settingsRes.data;

  if (courtsRes.error) throw courtsRes.error;
  if (busyRes.error) throw busyRes.error;
  if (blocksRes.error) throw blocksRes.error;
  if (settingsRes.error) throw settingsRes.error;

  return {
    branchId,
    courts: courtsRes.data ?? [],
    bookings: (busyRes.data ?? []) as TimeInterval[],
    blocks: (blocksRes.data ?? []) as TimeInterval[],
    openHour: settings?.exclusive_open_hour ?? 6,
    closeHour: settings?.exclusive_close_hour ?? 22,
    exclusiveFeeCents: settings?.exclusive_court_fee_cents ?? 50000,
    openPlayFeeCents: settings?.default_open_play_fee_cents ?? 12000,
  };
}
