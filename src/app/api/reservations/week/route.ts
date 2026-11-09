import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffApiActor } from "@/lib/auth/require-staff-api";
import { createClient } from "@/lib/supabase/server";
import {
  buildCourtHourGrid,
  manilaHourStart,
  type HourSlotStatus,
} from "@/lib/booking/court-availability";
import { buildWeekDayKeys } from "@/lib/booking/week-calendar";
import { fetchCourtScheduleSnapshot } from "@/lib/booking/fetch-court-schedule";

const querySchema = z.object({
  court_id: z.string().uuid(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type WeekBookingRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  label: string;
  walk_in_label: string | null;
};

export type WeekDayPayload = {
  date: string;
  hours: number[];
  cells: Record<number, HourSlotStatus>;
  blocks: {
    id: string;
    starts_at: string;
    ends_at: string;
    reason: string | null;
  }[];
  bookings: WeekBookingRow[];
};

export async function GET(request: Request) {
  const gate = await requireStaffApiActor();
  if ("error" in gate) {
    return gate.error;
  }

  const branchId = gate.profile.branch_id;
  if (!branchId) {
    return NextResponse.json({ error: "No branch assigned" }, { status: 400 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    court_id: url.searchParams.get("court_id"),
    week_start: url.searchParams.get("week_start"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Use ?court_id=&week_start=YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const { court_id, week_start } = parsed.data;
  const dayKeys = buildWeekDayKeys(week_start);
  const rangeStart = manilaHourStart(week_start, 0);
  const rangeEnd = new Date(
    manilaHourStart(dayKeys[6], 23).getTime() + 3600000
  );

  const supabase = await createClient();

  const { data: courtRow, error: courtErr } = await supabase
    .from("courts")
    .select("id, name")
    .eq("id", court_id)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (courtErr) {
    return NextResponse.json({ error: courtErr.message }, { status: 500 });
  }
  if (!courtRow) {
    return NextResponse.json({ error: "Court not found" }, { status: 404 });
  }

  try {
    const snapshot = await fetchCourtScheduleSnapshot(
      supabase,
      branchId,
      rangeStart,
      rangeEnd
    );

    const [{ data: blockRows }, { data: bookingRows }] = await Promise.all([
      supabase
        .from("court_schedule_blocks")
        .select("id, court_id, starts_at, ends_at, reason")
        .eq("branch_id", branchId)
        .eq("court_id", court_id)
        .gte("ends_at", rangeStart.toISOString())
        .lt("starts_at", rangeEnd.toISOString()),
      supabase
        .from("bookings")
        .select("id, court_id, starts_at, ends_at, walk_in_label, profile_id")
        .eq("branch_id", branchId)
        .eq("court_id", court_id)
        .eq("type", "exclusive")
        .eq("status", "confirmed")
        .gte("ends_at", rangeStart.toISOString())
        .lt("starts_at", rangeEnd.toISOString()),
    ]);

    const profileIds = [
      ...new Set(
        (bookingRows ?? [])
          .map((b) => b.profile_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const nameByProfile = new Map<string, string>();
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIds);
      for (const p of profiles ?? []) {
        nameByProfile.set(p.id, p.full_name?.trim() || "Member");
      }
    }

    const courts = [{ id: courtRow.id, name: courtRow.name }];

    const days: WeekDayPayload[] = dayKeys.map((dayKey) => {
      const dayStart = manilaHourStart(dayKey, 0);
      const dayEnd = new Date(dayStart.getTime() + 86400000);

      const dayBookings = (bookingRows ?? []).filter((b) => {
        const s = new Date(b.starts_at).getTime();
        return s >= dayStart.getTime() && s < dayEnd.getTime();
      });

      const dayBlocks = (blockRows ?? []).filter((b) => {
        const s = new Date(b.starts_at).getTime();
        return s >= dayStart.getTime() && s < dayEnd.getTime();
      });

      const { hours, cells } = buildCourtHourGrid({
        dayKey,
        openHour: snapshot.openHour,
        closeHour: snapshot.closeHour,
        courts,
        bookings: snapshot.bookings.filter((b) => {
          if (b.court_id !== court_id) return false;
          const s = new Date(b.starts_at).getTime();
          return s >= dayStart.getTime() && s < dayEnd.getTime();
        }),
        blocks: snapshot.blocks.filter((b) => {
          if (b.court_id !== court_id) return false;
          const s = new Date(b.starts_at).getTime();
          return s >= dayStart.getTime() && s < dayEnd.getTime();
        }),
      });

      const bookings: WeekBookingRow[] = dayBookings.map((b) => {
        const memberName = b.profile_id
          ? (nameByProfile.get(b.profile_id) ?? "Member")
          : "Member";
        const walkIn = b.walk_in_label?.trim();
        return {
          id: b.id,
          starts_at: b.starts_at,
          ends_at: b.ends_at,
          walk_in_label: walkIn ?? null,
          label: walkIn ? `Walk-in: ${walkIn}` : memberName,
        };
      });

      return {
        date: dayKey,
        hours,
        cells: cells[court_id] ?? {},
        blocks: dayBlocks.map((bl) => ({
          id: bl.id,
          starts_at: bl.starts_at,
          ends_at: bl.ends_at,
          reason: bl.reason,
        })),
        bookings,
      };
    });

    return NextResponse.json({
      week_start,
      court_id,
      court_name: courtRow.name,
      branch_id: branchId,
      open_hour: snapshot.openHour,
      close_hour: snapshot.closeHour,
      days,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load week schedule";
    const missingTable =
      message.includes("court_schedule_blocks") ||
      message.includes("42P01");
    return NextResponse.json(
      {
        error: missingTable
          ? "Reservations calendar requires migration 20261109120000_court_schedule_blocks"
          : message,
      },
      { status: 500 }
    );
  }
}
