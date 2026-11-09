"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  Clock,
  Loader2,
  Map,
  Pencil,
  Plus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { DEMO_OPEN_PLAY_SESSIONS } from "@/lib/demo-data";
import { formatDateTime } from "@/lib/utils";
import {
  MATCHING_STYLES,
  MATCHING_STYLE_LABELS,
  type MatchingStyle,
} from "@/lib/constants";
import { useAuthStore } from "@/store";
import { BranchSelect } from "@/components/shared/branch-select";
import { SessionPlayersPanel } from "@/components/open-play/session-players-panel";
import { listCourts } from "@/services/courts";
import {
  activateDueSessions,
  cancelScheduledSession,
  createScheduledSession,
  listOpenPlaySessions,
  sessionCourtNames,
  setSessionCourts,
  updateScheduledSession,
  type OpenPlaySessionRow,
  type OpenPlaySessionStatus,
} from "@/services/sessions";
import type { Court } from "@/types";

const STATUS_VARIANT: Record<
  OpenPlaySessionStatus,
  "warning" | "success" | "secondary"
> = {
  scheduled: "warning",
  open: "success",
  closed: "secondary",
};

const STATUS_FILTERS = [
  "upcoming",
  "scheduled",
  "open",
  "closed",
  "all",
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  upcoming: "Upcoming",
  scheduled: "Scheduled",
  open: "Open",
  closed: "Done / closed",
  all: "All statuses",
};

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultStartLocal() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return toLocalInputValue(d);
}

function defaultEndLocal() {
  const d = new Date();
  d.setHours(d.getHours() + 5, 0, 0, 0);
  return toLocalInputValue(d);
}

function parseSessionForm(
  title: string,
  startsLocal: string,
  endsLocal: string,
  maxPlayers: number,
  requireFutureEnd: boolean
):
  | { ok: true; trimmedTitle: string; startsAt: Date; endsAt: Date }
  | { ok: false; message: string } {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return { ok: false, message: "Title is required" };
  }
  if (!startsLocal || !endsLocal) {
    return { ok: false, message: "Start and end times are required" };
  }

  const startsAt = new Date(startsLocal);
  const endsAt = new Date(endsLocal);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { ok: false, message: "Invalid date/time" };
  }
  if (endsAt <= startsAt) {
    return { ok: false, message: "End time must be after start time" };
  }
  if (requireFutureEnd && endsAt.getTime() <= Date.now()) {
    return { ok: false, message: "End time must be in the future" };
  }
  if (maxPlayers <= 0) {
    return { ok: false, message: "Max players must be greater than 0" };
  }

  return { ok: true, trimmedTitle, startsAt, endsAt };
}

export default function OpenPlaySchedulePage() {
  const { isDemoMode, branch } = useAuthStore();
  const [sessions, setSessions] = useState<OpenPlaySessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [startsLocal, setStartsLocal] = useState(defaultStartLocal);
  const [endsLocal, setEndsLocal] = useState(defaultEndLocal);
  const [maxPlayers, setMaxPlayers] = useState(32);
  const [matchingStyle, setMatchingStyle] =
    useState<MatchingStyle>("auto_balanced");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  // Default hides closed/done sessions; open + scheduled stay in the list.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("upcoming");
  const [editingSession, setEditingSession] = useState<OpenPlaySessionRow | null>(
    null
  );
  const [editTitle, setEditTitle] = useState("");
  const [editStartsLocal, setEditStartsLocal] = useState(defaultStartLocal);
  const [editEndsLocal, setEditEndsLocal] = useState(defaultEndLocal);
  const [editMaxPlayers, setEditMaxPlayers] = useState(32);
  const [editMatchingStyle, setEditMatchingStyle] =
    useState<MatchingStyle>("auto_balanced");
  const [savingEdit, setSavingEdit] = useState(false);
  const [openPlayCourts, setOpenPlayCourts] = useState<Court[]>([]);
  const [createCourtIds, setCreateCourtIds] = useState<string[]>([]);
  const [editCourtIds, setEditCourtIds] = useState<string[]>([]);

  const toggleCourtId = (
    ids: string[],
    setIds: (next: string[]) => void,
    courtId: string
  ) => {
    setIds(
      ids.includes(courtId)
        ? ids.filter((id) => id !== courtId)
        : [...ids, courtId]
    );
  };

  async function loadLive() {
    if (!branch?.id) {
      setSessions([]);
      return;
    }

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    await activateDueSessions(supabase, branch.id);
    const sessionRows = await listOpenPlaySessions(supabase, branch.id, {
      from: new Date(Date.now() - 7 * 86400000).toISOString(),
    });
    setSessions(sessionRows);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      if (isDemoMode) {
        if (!cancelled) {
          const branchId = branch?.id;
          setSessions(
            (DEMO_OPEN_PLAY_SESSIONS as OpenPlaySessionRow[]).filter(
              (s) => !branchId || s.branch_id === branchId
            )
          );
          setLoading(false);
        }
        return;
      }

      // Wait for BranchSelect to hydrate a branch before querying.
      if (!branch?.id) {
        if (!cancelled) {
          setSessions([]);
          setLoading(false);
        }
        return;
      }

      try {
        await loadLive();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load schedule";
        toast.error(message);
        if (!cancelled) {
          setSessions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode, branch?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadCourts() {
      if (!branch?.id) {
        setOpenPlayCourts([]);
        return;
      }
      if (isDemoMode) {
        const { DEMO_COURTS } = await import("@/lib/demo-data");
        const rows = DEMO_COURTS.filter(
          (c) => c.branch_id === branch.id && c.is_open_play
        );
        if (!cancelled) setOpenPlayCourts(rows);
        return;
      }
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const rows = await listCourts(supabase, branch.id);
        if (!cancelled) {
          setOpenPlayCourts(rows.filter((c) => c.is_open_play));
        }
      } catch {
        if (!cancelled) setOpenPlayCourts([]);
      }
    }

    void loadCourts();
    return () => {
      cancelled = true;
    };
  }, [branch?.id, isDemoMode]);

  useEffect(() => {
    if (openPlayCourts.length === 1 && createCourtIds.length === 0) {
      setCreateCourtIds([openPlayCourts[0].id]);
    }
  }, [openPlayCourts, createCourtIds.length]);

  const upcoming = useMemo(() => {
    const filtered =
      statusFilter === "all"
        ? sessions
        : statusFilter === "upcoming"
          ? sessions.filter((s) => s.status !== "closed")
          : sessions.filter((s) => s.status === statusFilter);
    return [...filtered].sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    );
  }, [sessions, statusFilter]);

  const selectedSession = useMemo(
    () => upcoming.find((s) => s.id === selectedSessionId) ?? null,
    [upcoming, selectedSessionId]
  );

  useEffect(() => {
    if (
      selectedSessionId &&
      !upcoming.some((s) => s.id === selectedSessionId)
    ) {
      setSelectedSessionId(null);
    }
  }, [upcoming, selectedSessionId]);

  const openEditDialog = (session: OpenPlaySessionRow) => {
    if (session.status === "closed") return;
    setEditingSession(session);
    setEditTitle(session.title?.trim() ?? "");
    setEditStartsLocal(toLocalInputValue(new Date(session.starts_at)));
    setEditEndsLocal(toLocalInputValue(new Date(session.ends_at)));
    setEditMaxPlayers(session.max_players);
    setEditMatchingStyle(
      (session.matching_style as MatchingStyle) ?? "auto_balanced"
    );
    setEditCourtIds(
      (session.session_courts ?? [])
        .map((sc) => sc.court_id)
        .filter((id): id is string => Boolean(id))
    );
  };

  function CourtAssignmentFields({
    courtIds,
    onChange,
    idPrefix,
  }: {
    courtIds: string[];
    onChange: (next: string[]) => void;
    idPrefix: string;
  }) {
    return (
      <div className="space-y-2">
        <Label>Assigned courts</Label>
        {openPlayCourts.length === 0 ? (
          <p className="text-xs text-amber-600 dark:text-amber-300">
            No open-play courts. Set court type to Hybrid or Open Play in
            Settings → Courts.
          </p>
        ) : (
          <div className="grid gap-2">
            {openPlayCourts.map((court) => (
              <label
                key={court.id}
                htmlFor={`${idPrefix}-${court.id}`}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm"
              >
                <input
                  id={`${idPrefix}-${court.id}`}
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={courtIds.includes(court.id)}
                  onChange={() =>
                    toggleCourtId(courtIds, onChange, court.id)
                  }
                />
                <span className="min-w-0 flex-1">{court.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  const createSession = async () => {
    const parsed = parseSessionForm(
      title,
      startsLocal,
      endsLocal,
      maxPlayers,
      true
    );
    if (!parsed.ok) {
      toast.error(parsed.message);
      return;
    }
    const { trimmedTitle, startsAt, endsAt } = parsed;

    setSaving(true);

    const withinRange =
      startsAt.getTime() <= Date.now() && Date.now() < endsAt.getTime();

    if (isDemoMode) {
      const row: OpenPlaySessionRow = {
        id: `ops-demo-${Date.now()}`,
        branch_id: branch?.id ?? "branch-1",
        court_id: null,
        title: trimmedTitle,
        status: withinRange ? "open" : "scheduled",
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        started_at: withinRange ? new Date().toISOString() : null,
        closed_at: null,
        max_players: maxPlayers,
        matching_style: matchingStyle,
        style_config: {},
        created_by: null,
        court: null,
        session_courts: createCourtIds.map((court_id) => ({
          court_id,
          court: openPlayCourts.find((c) => c.id === court_id) ?? null,
        })),
      };
      setSessions((prev) => [row, ...prev]);
      setTitle("");
      setStartsLocal(defaultStartLocal());
      setEndsLocal(defaultEndLocal());
      setCreateCourtIds(
        openPlayCourts.length === 1 ? [openPlayCourts[0].id] : []
      );
      toast.success(withinRange ? "Session opened" : "Session scheduled", {
        description: `${trimmedTitle} · ${formatDateTime(row.starts_at)}`,
      });
      setSaving(false);
      return;
    }

    try {
      if (!branch?.id) throw new Error("No branch selected");
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const created = await createScheduledSession(supabase, {
        branchId: branch.id,
        title: trimmedTitle,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        maxPlayers,
        matchingStyle,
        courtIds: createCourtIds.length ? createCourtIds : undefined,
      });
      if (createCourtIds.length > 0) {
        await setSessionCourts(supabase, created.id, createCourtIds);
      }
      await loadLive();
      setTitle("");
      setStartsLocal(defaultStartLocal());
      setEndsLocal(defaultEndLocal());
      setCreateCourtIds(
        openPlayCourts.length === 1 ? [openPlayCourts[0].id] : []
      );
      toast.success("Session saved");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create session";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const saveEditedSession = async () => {
    if (!editingSession) return;

    const parsed = parseSessionForm(
      editTitle,
      editStartsLocal,
      editEndsLocal,
      editMaxPlayers,
      editingSession.status === "scheduled"
    );
    if (!parsed.ok) {
      toast.error(parsed.message);
      return;
    }
    const { trimmedTitle, startsAt, endsAt } = parsed;

    if (
      editingSession.status === "open" &&
      endsAt.getTime() <= Date.now()
    ) {
      toast.error("End time must still be in the future for an open session");
      return;
    }

    setSavingEdit(true);

    if (isDemoMode) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === editingSession.id
            ? {
                ...s,
                title: trimmedTitle,
                starts_at: startsAt.toISOString(),
                ends_at: endsAt.toISOString(),
                max_players: editMaxPlayers,
                matching_style: editMatchingStyle,
                session_courts: editCourtIds.map((court_id) => ({
                  court_id,
                  court: openPlayCourts.find((c) => c.id === court_id) ?? null,
                })),
              }
            : s
        )
      );
      toast.success("Session updated");
      setEditingSession(null);
      setSavingEdit(false);
      return;
    }

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await updateScheduledSession(supabase, editingSession.id, {
        title: trimmedTitle,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        maxPlayers: editMaxPlayers,
        matchingStyle: editMatchingStyle,
      });
      if (editCourtIds.length > 0) {
        await setSessionCourts(supabase, editingSession.id, editCourtIds);
      }
      await loadLive();
      toast.success("Session updated");
      setEditingSession(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update session";
      toast.error(message);
    } finally {
      setSavingEdit(false);
    }
  };

  const cancelSession = async (session: OpenPlaySessionRow) => {
    if (session.status !== "scheduled") return;

    if (isDemoMode) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === session.id
            ? {
                ...s,
                status: "closed",
                closed_at: new Date().toISOString(),
              }
            : s
        )
      );
      toast.success("Session cancelled");
      return;
    }

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await cancelScheduledSession(supabase, session.id);
      await loadLive();
      toast.success("Session cancelled");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to cancel session";
      toast.error(message);
    }
  };

  const selectClassName =
    "flex h-10 w-full rounded-xl border border-border/70 bg-background/50 px-3 py-2 text-sm shadow-sm backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

  return (
    <DashboardShell>
      <PageHeader
        title="Open Play Schedule"
        description={
          branch
            ? `Schedule open play for ${branch.name}. If the current time falls in the window, the session opens immediately for the queue.`
            : "Create one-off open play windows. If the current time falls in the window, the session opens immediately for the queue."
        }
        actions={<BranchSelect id="schedule-branch" />}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              Schedule Session
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="session-title">Title</Label>
              <Input
                id="session-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Evening Open Play"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="session-start">Starts at</Label>
              <Input
                id="session-start"
                type="datetime-local"
                value={startsLocal}
                onChange={(e) => setStartsLocal(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="session-end">Ends at</Label>
              <Input
                id="session-end"
                type="datetime-local"
                value={endsLocal}
                onChange={(e) => setEndsLocal(e.target.value)}
              />
            </div>
            <CourtAssignmentFields
              idPrefix="create-session"
              courtIds={createCourtIds}
              onChange={setCreateCourtIds}
            />
            <div className="space-y-1.5">
              <Label htmlFor="session-capacity">Max players</Label>
              <Input
                id="session-capacity"
                type="number"
                min={1}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="session-style">Matching style</Label>
              <select
                id="session-style"
                className={selectClassName}
                value={matchingStyle}
                onChange={(e) =>
                  setMatchingStyle(e.target.value as MatchingStyle)
                }
              >
                {MATCHING_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {MATCHING_STYLE_LABELS[style]}
                  </option>
                ))}
              </select>
            </div>
            <Button
              className="w-full"
              onClick={() => void createSession()}
              disabled={saving || loading}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarClock className="mr-2 h-4 w-4" />
              )}
              Create session
            </Button>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Upcoming & recent
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="schedule-status-filter" className="sr-only">
                Status
              </Label>
              <select
                id="schedule-status-filter"
                className={`${selectClassName} h-9 w-full sm:w-44`}
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
              >
                {STATUS_FILTERS.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_FILTER_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading schedule…
              </div>
            ) : upcoming.length === 0 ? (
              <EmptyState
                title={
                  statusFilter === "all" || statusFilter === "upcoming"
                    ? "No upcoming sessions"
                    : `No ${STATUS_FILTER_LABELS[statusFilter].toLowerCase()} sessions`
                }
                description={
                  statusFilter === "scheduled"
                    ? "Create a one-off open play window to get started."
                    : "Try another status filter or create a new session."
                }
                icon={<CalendarClock className="h-6 w-6" />}
              />
            ) : (
              <div className="space-y-3">
                {upcoming.map((session, index) => (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                      selectedSessionId === session.id
                        ? "border-primary/50 bg-primary/5"
                        : "border-border/60 bg-background/40"
                    }`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 space-y-1.5 text-left"
                      onClick={() =>
                        setSelectedSessionId((id) =>
                          id === session.id ? null : session.id
                        )
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={STATUS_VARIANT[session.status]}>
                          {session.status}
                        </Badge>
                        <span className="text-sm font-medium">
                          {session.title?.trim() || "Untitled session"}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {MATCHING_STYLE_LABELS[
                          session.matching_style as MatchingStyle
                        ] ?? session.matching_style}{" "}
                        · {formatDateTime(session.starts_at)} →{" "}
                        {formatDateTime(session.ends_at)}
                      </p>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Map className="h-3.5 w-3.5" />
                          {sessionCourtNames(session)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          Max {session.max_players}
                        </span>
                        <span className="text-primary">
                          {selectedSessionId === session.id
                            ? "Hide players"
                            : "Manage players"}
                        </span>
                      </div>
                    </button>
                    {session.status !== "closed" ? (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(session)}
                        >
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          Edit
                        </Button>
                        {session.status === "scheduled" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void cancelSession(session)}
                          >
                            <X className="mr-1.5 h-3.5 w-3.5" />
                            Cancel
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedSession ? (
        <div className="mt-4">
          <SessionPlayersPanel
            key={selectedSession.id}
            session={selectedSession}
            onClose={() => setSelectedSessionId(null)}
          />
        </div>
      ) : null}

      <Dialog
        open={editingSession !== null}
        onOpenChange={(open) => {
          if (!open) setEditingSession(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit session</DialogTitle>
            <DialogDescription>
              Update title, window, capacity, matching style, and which courts
              members see on the Open Play booking list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-session-title">Title</Label>
              <Input
                id="edit-session-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-session-start">Starts at</Label>
              <Input
                id="edit-session-start"
                type="datetime-local"
                value={editStartsLocal}
                onChange={(e) => setEditStartsLocal(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-session-end">Ends at</Label>
              <Input
                id="edit-session-end"
                type="datetime-local"
                value={editEndsLocal}
                onChange={(e) => setEditEndsLocal(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-session-capacity">Max players</Label>
              <Input
                id="edit-session-capacity"
                type="number"
                min={1}
                value={editMaxPlayers}
                onChange={(e) =>
                  setEditMaxPlayers(Number(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-session-style">Matching style</Label>
              <select
                id="edit-session-style"
                className={selectClassName}
                value={editMatchingStyle}
                onChange={(e) =>
                  setEditMatchingStyle(e.target.value as MatchingStyle)
                }
              >
                {MATCHING_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {MATCHING_STYLE_LABELS[style]}
                  </option>
                ))}
              </select>
            </div>
            <CourtAssignmentFields
              idPrefix="edit-session"
              courtIds={editCourtIds}
              onChange={setEditCourtIds}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingSession(null)}
            >
              Close
            </Button>
            <Button
              type="button"
              disabled={savingEdit}
              onClick={() => void saveEditedSession()}
            >
              {savingEdit ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
