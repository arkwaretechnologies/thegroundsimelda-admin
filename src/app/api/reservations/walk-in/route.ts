import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffApiActor } from "@/lib/auth/require-staff-api";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  court_id: z.string().uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
  walk_in_label: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  const gate = await requireStaffApiActor();
  if ("error" in gate) {
    return gate.error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_create_booking", {
    p_court_id: parsed.data.court_id,
    p_starts_at: parsed.data.starts_at,
    p_ends_at: parsed.data.ends_at,
    p_walk_in_label: parsed.data.walk_in_label ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ booking: data });
}
