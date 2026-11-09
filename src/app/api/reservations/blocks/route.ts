import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffApiActor } from "@/lib/auth/require-staff-api";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("close_hours"),
    court_id: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hours: z.array(z.number().int().min(0).max(23)),
    reason: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal("close_day"),
    court_id: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal("delete"),
    block_ids: z.array(z.string().uuid()).min(1),
  }),
]);

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
  const data = parsed.data;

  if (data.action === "close_hours") {
    const { error } = await supabase.rpc("staff_set_court_blocks", {
      p_court_id: data.court_id,
      p_date: data.date,
      p_hours: data.hours,
      p_reason: data.reason ?? null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (data.action === "close_day") {
    const { error } = await supabase.rpc("staff_close_court_day", {
      p_court_id: data.court_id,
      p_date: data.date,
      p_reason: data.reason ?? null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.rpc("staff_delete_court_blocks", {
    p_block_ids: data.block_ids,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
