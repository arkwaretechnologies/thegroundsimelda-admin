"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  formatExclusiveHourLabel,
  manilaWeekStartKey,
  shiftWeekStartKey,
} from "@/lib/booking/week-calendar";
import { manilaHourStart } from "@/lib/booking/court-availability";
import type { HourSlotStatus } from "@/lib/booking/court-availability";
import type { WeekDayPayload } from "@/app/api/reservations/week/route";

const MANILA = "Asia/Manila";

type Court = { id: string; name: string };

type WeekResponse = {
  week_start: string;
  court_id: string;
  court_name: string;
  open_hour: number;
  close_hour: number;
  days: WeekDayPayload[];
  error?: string;
};

function cellKey(date: string, hour: number) {
  return `${date}:${hour}`;
}

function fmtDayHeader(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-PH", {
    timeZone: MANILA,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function bookingForHour(
  day: WeekDayPayload,
  hour: number
): { label: string } | null {
  const start = manilaHourStart(day.date, hour);
  const end = new Date(start.getTime() + 3600000);
  for (const b of day.bookings) {
    const bs = new Date(b.starts_at).getTime();
    const be = new Date(b.ends_at).getTime();
    if (bs < end.getTime() && be > start.getTime()) {
      return { label: b.label };
    }
  }
  return null;
}

type WalkInSelection =
  | {
      ok: true;
      date: string;
      hours: number[];
      durationHours: number;
      label: string;
      startsAt: string;
      endsAt: string;
    }
  | { ok: false; message: string };

function parseWalkInSelection(
  week: WeekResponse | null,
  selectionByDate: Map<string, number[]>
): WalkInSelection {
  const entries = [...selectionByDate.entries()];
  if (entries.length === 0) {
    return { ok: false, message: "Select one or more open hours on a single day" };
  }
  if (entries.length > 1) {
    return { ok: false, message: "Walk-in must fit on one day — use one column only" };
  }

  const [date, hours] = entries[0];
  if (hours.length === 0) {
    return { ok: false, message: "Select open hours to reserve" };
  }

  for (let i = 1; i < hours.length; i++) {
    if (hours[i] !== hours[i - 1] + 1) {
      return {
        ok: false,
        message: "Choose consecutive hours (e.g. 2–3 PM for 2 hours)",
      };
    }
  }

  const day = week?.days.find((d) => d.date === date);
  if (!day) {
    return { ok: false, message: "Could not read that day on the calendar" };
  }

  for (const h of hours) {
    const status = day.cells[h] ?? "available";
    if (status !== "available") {
      return {
        ok: false,
        message: `${formatExclusiveHourLabel(h)} on ${fmtDayHeader(date)} is not open`,
      };
    }
  }

  const first = hours[0];
  const last = hours[hours.length - 1];
  const startsAt = manilaHourStart(date, first).toISOString();
  const endsAt = manilaHourStart(date, last + 1).toISOString();
  const durationHours = hours.length;

  const label =
    durationHours === 1
      ? `${fmtDayHeader(date)} · ${formatExclusiveHourLabel(first)} (1 hr)`
      : `${fmtDayHeader(date)} · ${formatExclusiveHourLabel(first)} – ${formatExclusiveHourLabel(last + 1)} (${durationHours} hrs)`;

  return {
    ok: true,
    date,
    hours,
    durationHours,
    label,
    startsAt,
    endsAt,
  };
}

function blockForHour(
  day: WeekDayPayload,
  hour: number
): { reason: string | null; id: string } | null {
  const start = manilaHourStart(day.date, hour);
  const end = new Date(start.getTime() + 3600000);
  for (const b of day.blocks) {
    const bs = new Date(b.starts_at).getTime();
    const be = new Date(b.ends_at).getTime();
    if (bs < end.getTime() && be > start.getTime()) {
      return { reason: b.reason, id: b.id };
    }
  }
  return null;
}

export function ReservationsWeekCalendar({
  exclusiveOpenHour,
  exclusiveCloseHour,
}: {
  exclusiveOpenHour: number;
  exclusiveCloseHour: number;
}) {
  const [weekStart, setWeekStart] = useState(() => manilaWeekStartKey());
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtId, setCourtId] = useState("");
  const [week, setWeek] = useState<WeekResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [walkInLabel, setWalkInLabel] = useState("");
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [walkInModalOpen, setWalkInModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadCourts = useCallback(async () => {
    const res = await fetch("/api/reservations/courts");
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Could not load courts");
      return;
    }
    const list = (data.courts ?? []) as Court[];
    setCourts(list);
    if (!courtId && list[0]?.id) setCourtId(list[0].id);
  }, [courtId]);

  const loadWeek = useCallback(async () => {
    if (!courtId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reservations/week?court_id=${encodeURIComponent(courtId)}&week_start=${encodeURIComponent(weekStart)}`
      );
      const data = (await res.json()) as WeekResponse;
      if (!res.ok) throw new Error(data.error ?? "Could not load week");
      setWeek(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load week");
      setWeek(null);
    } finally {
      setLoading(false);
    }
  }, [courtId, weekStart]);

  useEffect(() => {
    void loadCourts();
  }, [loadCourts]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  const hours = useMemo(() => {
    if (week?.days[0]?.hours?.length) return week.days[0].hours;
    const out: number[] = [];
    for (let h = exclusiveOpenHour; h < exclusiveCloseHour; h++) out.push(h);
    return out;
  }, [week, exclusiveOpenHour, exclusiveCloseHour]);

  const toggleCell = (date: string, hour: number) => {
    const key = cellKey(date, hour);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectionByDate = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const key of selected) {
      const [date, h] = key.split(":");
      const list = map.get(date) ?? [];
      list.push(Number(h));
      map.set(date, list);
    }
    for (const [d, list] of map) {
      map.set(
        d,
        list.sort((a, b) => a - b)
      );
    }
    return map;
  }, [selected]);

  async function postBlocks(body: Record<string, unknown>) {
    const res = await fetch("/api/reservations/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false as const, error: data.error ?? "Failed" };
    return { ok: true as const };
  }

  function openCloseModal() {
    if (selectionByDate.size === 0) {
      toast.error("Select one or more hours to close");
      return;
    }
    setCloseModalOpen(true);
  }

  async function confirmCloseSelected() {
    if (selectionByDate.size === 0) return;
    setActionLoading(true);
    for (const [date, hoursList] of selectionByDate) {
      const { ok, error } = await postBlocks({
        action: "close_hours",
        court_id: courtId,
        date,
        hours: hoursList,
        reason: reason.trim() || undefined,
      });
      if (!ok) {
        toast.error(error);
        setActionLoading(false);
        return;
      }
    }
    toast.success("Selected hours closed");
    setReason("");
    setSelected(new Set());
    setCloseModalOpen(false);
    setActionLoading(false);
    void loadWeek();
  }

  async function reopenSelected() {
    if (!week || selectionByDate.size === 0) {
      setSelected(new Set());
      return;
    }
    const blockIds: string[] = [];
    for (const [date, hoursList] of selectionByDate) {
      const day = week.days.find((d) => d.date === date);
      if (!day) continue;
      for (const h of hoursList) {
        const bl = blockForHour(day, h);
        if (bl) blockIds.push(bl.id);
      }
    }
    if (blockIds.length === 0) {
      toast.message("No closures to remove for selection");
      setSelected(new Set());
      return;
    }
    const { ok, error } = await postBlocks({
      action: "delete",
      block_ids: blockIds,
    });
    if (!ok) toast.error(error);
    else {
      toast.success("Closures removed");
      setSelected(new Set());
      void loadWeek();
    }
  }

  const walkInSelection = useMemo(
    () => parseWalkInSelection(week, selectionByDate),
    [week, selectionByDate]
  );

  function openWalkInModal() {
    if (!walkInSelection.ok) {
      toast.error(walkInSelection.message);
      return;
    }
    setWalkInModalOpen(true);
  }

  async function confirmWalkInReserve() {
    if (!walkInSelection.ok) return;
    setActionLoading(true);

    const res = await fetch("/api/reservations/walk-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        court_id: courtId,
        starts_at: walkInSelection.startsAt,
        ends_at: walkInSelection.endsAt,
        walk_in_label: walkInLabel.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Walk-in failed");
      setActionLoading(false);
      return;
    }
    toast.success("Walk-in reservation saved");
    setWalkInLabel("");
    setSelected(new Set());
    setWalkInModalOpen(false);
    setActionLoading(false);
    void loadWeek();
  }

  const selectedSlotCount = selected.size;

  const walkInSlotLabel = walkInSelection.ok ? walkInSelection.label : null;

  const allBookings = useMemo(
    () => week?.days.flatMap((d) => d.bookings) ?? [],
    [week]
  );

  return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="res-court">Court</Label>
              <select
                id="res-court"
                value={courtId}
                onChange={(e) => setCourtId(e.target.value)}
                className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() =>
                  setWeekStart((w) => shiftWeekStartKey(w, -1))
                }
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[10rem] text-center text-sm font-medium">
                Week of {fmtDayHeader(weekStart)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setWeekStart((w) => shiftWeekStartKey(w, 1))}
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings">
              <Settings className="mr-2 h-4 w-4" />
              Exclusive hours: {formatExclusiveHourLabel(exclusiveOpenHour)} –{" "}
              {formatExclusiveHourLabel(exclusiveCloseHour)}
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={loading || selected.size === 0}
            onClick={openCloseModal}
          >
            Close selected
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || selected.size === 0}
            onClick={() => void reopenSelected()}
          >
            Reopen selected
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={loading || selected.size === 0}
            onClick={openWalkInModal}
          >
            {walkInSelection.ok && walkInSelection.durationHours > 1
              ? `Walk-in (${walkInSelection.durationHours} hrs)`
              : "Walk-in"}
          </Button>
        </div>

        <Dialog open={closeModalOpen} onOpenChange={setCloseModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Close selected hours</DialogTitle>
              <DialogDescription>
                {selectedSlotCount === 1
                  ? "1 hour will be closed for members."
                  : `${selectedSlotCount} hours will be closed for members.`}{" "}
                Optional note is staff-only.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="closure-reason">Internal note (optional)</Label>
              <Input
                id="closure-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Tournament setup"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={actionLoading}
                onClick={() => setCloseModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={actionLoading}
                onClick={() => void confirmCloseSelected()}
              >
                {actionLoading ? "Closing…" : "Close hours"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={walkInModalOpen} onOpenChange={setWalkInModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Walk-in reservation</DialogTitle>
              <DialogDescription>
                {walkInSlotLabel
                  ? `Reserve ${walkInSlotLabel}.`
                  : "Select consecutive open hours on one day."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="walk-in-label">Guest name (optional)</Label>
              <Input
                id="walk-in-label"
                value={walkInLabel}
                onChange={(e) => setWalkInLabel(e.target.value)}
                placeholder="Guest name"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={actionLoading}
                onClick={() => setWalkInModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={actionLoading}
                onClick={() => void confirmWalkInReserve()}
              >
                {actionLoading ? "Saving…" : "Confirm walk-in"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {courts.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground">
            No exclusive courts. Mark a court as exclusive (and Hybrid if needed)
            under Settings → Courts, and apply the court schedule migration.
          </p>
        ) : loading && !week ? (
          <p className="text-sm text-muted-foreground">Loading schedule…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[48rem] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 bg-card p-2 text-left font-medium text-muted-foreground">
                    Hour
                  </th>
                  {(week?.days ?? []).map((day) => (
                    <th
                      key={day.date}
                      className="p-2 text-center font-medium text-muted-foreground"
                    >
                      {fmtDayHeader(day.date)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hours.map((h) => (
                  <tr key={h} className="border-t border-border/60">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-card p-2 font-medium">
                      {formatExclusiveHourLabel(h)}
                    </td>
                    {(week?.days ?? []).map((day) => {
                      const status = day.cells[h] ?? ("available" as const);
                      const picked = selected.has(cellKey(day.date, h));
                      const booked = status === "booked" ? bookingForHour(day, h) : null;
                      const closed =
                        status === "closed" ? blockForHour(day, h) : null;
                      return (
                        <td key={day.date} className="p-0.5">
                              <button
                                type="button"
                                title={
                                  booked?.label ??
                                  closed?.reason ??
                                  status
                                }
                                onClick={() => toggleCell(day.date, h)}
                                className={cn(
                                  "h-9 w-full min-w-[3.25rem] rounded-md border text-[0.65rem] font-semibold uppercase transition",
                                  status === "available" &&
                                    "border-primary/25 bg-primary/5 text-foreground",
                                  status === "booked" &&
                                    "border-border bg-muted text-muted-foreground",
                                  status === "closed" &&
                                    "border-destructive/30 bg-destructive/10 text-destructive",
                                  picked &&
                                    "ring-2 ring-primary ring-offset-1 ring-offset-background"
                                )}
                              >
                                {status === "available"
                                  ? "Open"
                                  : status === "booked"
                                    ? "Booked"
                                    : "Closed"}
                              </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Paid member bookings appear as Booked (auto-confirmed). Walk-in: pick
          consecutive open slots on the same day (e.g. two cells for 2 hours).
          Closures block the member app; notes are staff-only.
        </p>

        {allBookings.length > 0 && (
          <div className="rounded-xl border border-border p-4">
            <h3 className="mb-2 text-sm font-semibold">This week&apos;s bookings</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {allBookings.map((b) => (
                <li key={b.id}>
                  {new Date(b.starts_at).toLocaleString("en-PH", {
                    timeZone: MANILA,
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  — {b.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
  );
}
