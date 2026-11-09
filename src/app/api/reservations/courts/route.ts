import { NextResponse } from "next/server";
import { requireStaffApiActor } from "@/lib/auth/require-staff-api";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const gate = await requireStaffApiActor();
  if ("error" in gate) {
    return gate.error;
  }

  const branchId = gate.profile.branch_id;
  if (!branchId) {
    return NextResponse.json({ error: "No branch assigned" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courts")
    .select("id, name, sort_order")
    .eq("branch_id", branchId)
    .eq("is_exclusive", true)
    .eq("status", "available")
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ courts: data ?? [] });
}
