import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireStaffApiActor } from "@/lib/auth/require-staff-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { MATCHING_STYLES } from "@/lib/constants";

const patchSchema = z.object({
  title: z.string().trim().min(1),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  maxPlayers: z.coerce.number().int().positive(),
  matchingStyle: z.enum(MATCHING_STYLES),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const gate = await requireStaffApiActor();
  if ("error" in gate) {
    return gate.error as NextResponse;
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: "Invalid date/time" }, { status: 400 });
  }
  if (endsAt <= startsAt) {
    return NextResponse.json(
      { error: "End time must be after start time" },
      { status: 400 }
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server is missing Supabase service credentials" },
      { status: 500 }
    );
  }

  const { data: existing, error: loadError } = await admin
    .from("open_play_sessions")
    .select("id, branch_id, status")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (existing.status === "closed") {
    return NextResponse.json(
      { error: "Closed sessions cannot be edited" },
      { status: 400 }
    );
  }

  const actorRole = gate.profile.admin_role;
  if (
    gate.profile.branch_id &&
    gate.profile.branch_id !== existing.branch_id &&
    actorRole !== "super_admin"
  ) {
    return NextResponse.json(
      { error: "You can only edit sessions for your branch" },
      { status: 403 }
    );
  }

  const { data, error } = await admin
    .from("open_play_sessions")
    .update({
      title: input.title,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      max_players: input.maxPlayers,
      matching_style: input.matchingStyle,
    })
    .eq("id", id)
    .in("status", ["scheduled", "open"])
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Session not found or cannot be edited" },
      { status: 400 }
    );
  }

  return NextResponse.json({ id: data.id });
}
