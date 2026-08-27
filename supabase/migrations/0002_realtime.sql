-- ============================================================================
-- Dayflow HRMS (HRMS2) — enable Supabase Realtime
-- Run in the Supabase SQL Editor after 0001_init.sql.
-- Adds the HRMS tables to the `supabase_realtime` publication so the app
-- receives INSERT/UPDATE/DELETE events and keeps every open client in sync.
-- Idempotent: safe to re-run.
-- ============================================================================

-- REPLICA IDENTITY FULL makes DELETE (and UPDATE) events carry the full old
-- row, so Realtime can evaluate RLS and deliver them to authorized clients.
alter table public.profiles                 replica identity full;
alter table public.leave_requests           replica identity full;
alter table public.attendance               replica identity full;
alter table public.time_off_requests        replica identity full;
alter table public.payroll                  replica identity full;
alter table public.employee_salaries        replica identity full;
alter table public.company_salary_structure replica identity full;
alter table public.activities               replica identity full;

-- Add each table to the realtime publication only if not already a member.
do $$
declare
  t text;
  tables text[] := array[
    'profiles', 'leave_requests', 'attendance', 'time_off_requests',
    'payroll', 'employee_salaries', 'company_salary_structure', 'activities'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
