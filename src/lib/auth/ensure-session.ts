import { loadStaffSessionFromSupabase } from "@/lib/auth/staff-session";
import type { Branch, StaffProfile } from "@/types";

const VERIFY_INTERVAL_MS = 5 * 60 * 1000;

let lastVerifiedAt = 0;
let inflight: Promise<"ok" | "unauthorized" | "error"> | null = null;

export function resetSessionVerification() {
  lastVerifiedAt = 0;
  inflight = null;
}

export function markSessionVerified() {
  lastVerifiedAt = Date.now();
}

async function getUserWithRetry() {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();

  for (let attempt = 0; attempt < 2; attempt++) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (!error && user) {
      return { supabase, user };
    }

    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return null;
}

export type SessionVerifyCallbacks = {
  setSession: (payload: {
    staff: StaffProfile;
    branch: Branch | null;
    isDemoMode?: boolean;
  }) => void;
  clearSession: () => void;
};

/**
 * Idempotent Supabase + staff profile check. Safe to call from every DashboardShell mount.
 */
export async function ensureSessionVerified(
  callbacks: SessionVerifyCallbacks
): Promise<"ok" | "unauthorized" | "error"> {
  const now = Date.now();
  if (lastVerifiedAt > 0 && now - lastVerifiedAt < VERIFY_INTERVAL_MS) {
    return "ok";
  }

  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    try {
      const result = await getUserWithRetry();
      if (!result) {
        resetSessionVerification();
        callbacks.clearSession();
        return "unauthorized" as const;
      }

      const session = await loadStaffSessionFromSupabase(
        result.supabase,
        result.user.id,
        result.user.email ?? ""
      );

      if (!session) {
        await result.supabase.auth.signOut();
        resetSessionVerification();
        callbacks.clearSession();
        return "unauthorized" as const;
      }

      callbacks.setSession({
        staff: session.staff,
        branch: session.branch,
        isDemoMode: false,
      });

      lastVerifiedAt = Date.now();
      return "ok" as const;
    } catch {
      return "error" as const;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
