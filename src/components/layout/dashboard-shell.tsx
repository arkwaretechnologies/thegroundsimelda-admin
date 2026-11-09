"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { useAuthStore, useUIStore } from "@/store";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/shared/loading-skeletons";
import { clearDemoCookie } from "@/lib/demo-mode";
import { ensureSessionVerified } from "@/lib/auth/ensure-session";
import { toast } from "sonner";

export function DashboardShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const { sidebarCollapsed } = useUIStore();
  const verifyToastShown = useRef(false);

  useEffect(() => {
    if (hasHydrated) return;

    const persistApi = (
      useAuthStore as unknown as {
        persist?: {
          hasHydrated?: () => boolean;
          onFinishHydration?: (cb: () => void) => () => void;
        };
      }
    ).persist;

    const finish = () => useAuthStore.setState({ _hasHydrated: true });

    if (persistApi?.hasHydrated?.()) {
      finish();
      return;
    }

    const unsub = persistApi?.onFinishHydration?.(finish);

    return () => {
      unsub?.();
    };
  }, [hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) return;

    if (!staff) {
      clearDemoCookie();
      router.replace("/login");
      return;
    }

    clearDemoCookie();

    let cancelled = false;

    void (async () => {
      const result = await ensureSessionVerified({ setSession, clearSession });
      if (cancelled) return;

      if (result === "unauthorized") {
        if (!verifyToastShown.current) {
          verifyToastShown.current = true;
          toast.error("Session expired. Please sign in again.");
        }
        router.replace("/login");
        return;
      }

      if (result === "error" && !verifyToastShown.current) {
        verifyToastShown.current = true;
        toast.error("Could not verify your session. Try refreshing the page.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, staff?.id, router, setSession, clearSession]);

  if (!hasHydrated || !staff) {
    return (
      <div className="min-h-screen p-6">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app">
      <AppSidebar />
      <div
        className={cn(
          "transition-all duration-300",
          sidebarCollapsed ? "lg:pl-[88px]" : "lg:pl-72"
        )}
      >
        <AppHeader title={title} subtitle={subtitle} />
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
