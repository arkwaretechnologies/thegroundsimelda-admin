"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/shared/page-header";
import { ReservationsWeekCalendar } from "@/components/reservations/week-calendar";
import { useAuthStore } from "@/store";
import { createClient } from "@/lib/supabase/client";
import { getBranchFeeDefaults } from "@/services/branch-services";

export default function ReservationsPage() {
  const branch = useAuthStore((s) => s.branch);
  const [openHour, setOpenHour] = useState(6);
  const [closeHour, setCloseHour] = useState(22);

  useEffect(() => {
    if (!branch?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const row = await getBranchFeeDefaults(supabase, branch.id);
        if (!cancelled) {
          setOpenHour(row.exclusive_open_hour ?? 6);
          setCloseHour(row.exclusive_close_hour ?? 22);
        }
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branch?.id]);

  return (
    <DashboardShell
      title="Reservations"
      subtitle="Exclusive court calendar — synced with member Book a court"
    >
      <PageHeader
        title="Reservations"
        description="Week view by court. Close hours with an internal note; member app sees slots as unavailable. Paid bookings are confirmed automatically."
      />
      <ReservationsWeekCalendar
        exclusiveOpenHour={openHour}
        exclusiveCloseHour={closeHour}
      />
    </DashboardShell>
  );
}
