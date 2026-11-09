import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireStaffApiActor } from "@/lib/auth/require-staff-api";
import { createAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({
  mode: z.literal("hybrid"),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const gate = await requireStaffApiActor({
    allowRoles: ["super_admin", "manager"],
  });
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
    return NextResponse.json({ error: "Only hybrid mode is supported here" }, {
      status: 400,
    });
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

  const { data: court, error: loadError } = await admin
    .from("courts")
    .select("id, branch_id")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!court) {
    return NextResponse.json({ error: "Court not found" }, { status: 404 });
  }

  if (
    gate.profile.branch_id &&
    gate.profile.branch_id !== court.branch_id &&
    gate.profile.admin_role !== "super_admin"
  ) {
    return NextResponse.json(
      { error: "You can only edit courts for your branch" },
      { status: 403 }
    );
  }

  const { data, error } = await admin
    .from("courts")
    .update({
      is_exclusive: true,
      is_open_play: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Court update failed" }, { status: 400 });
  }

  return NextResponse.json({ id: data.id });
}
