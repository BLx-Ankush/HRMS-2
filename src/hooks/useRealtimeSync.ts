import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

// Map each realtime-enabled table to the React Query keys that depend on it.
// Any INSERT/UPDATE/DELETE on a table invalidates its keys so every open
// client (admin and employees) refetches and stays in sync.
const TABLE_KEYS: Record<string, string[][]> = {
  profiles: [["employees"], ["stats"]],
  leave_requests: [["leave_requests"], ["stats"]],
  attendance: [["attendance"], ["attendance_today"], ["stats"]],
  time_off_requests: [["time_off"]],
  payroll: [["payroll"], ["stats"]],
  employee_salaries: [["employee_salaries"]],
  company_salary_structure: [["company_structure"]],
  activities: [["activities"]],
};

/**
 * Subscribes to Postgres changes on all HRMS tables and invalidates the
 * matching React Query caches. Re-subscribes when the signed-in user changes
 * so Realtime uses the authenticated token (RLS gates events to authenticated
 * users). Mount a single instance high in the tree.
 */
export function useRealtimeSync() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return; // only subscribe once authenticated

    const channel = supabase.channel("hrms-realtime");

    Object.entries(TABLE_KEYS).forEach(([table, keys]) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
        }
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, userId]);
}

/** Renderless component that activates realtime sync for its subtree. */
export function RealtimeSync() {
  useRealtimeSync();
  return null;
}
