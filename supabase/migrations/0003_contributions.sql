-- ============================================================================
-- Dayflow HRMS (HRMS2) — contributions & bonus awards
-- Run in the Supabase SQL Editor after 0002_realtime.sql.
--
-- Backs the Employee Bonuses screen: employees log what they actually shipped,
-- HR verifies it, and only verified evidence feeds the contribution score used
-- for bonuses and the best-employee shortlist. The score itself is computed in
-- the browser (src/lib/webmcp/contributionScore.ts) so it stays auditable —
-- nothing here stores an opaque rating, only the evidence it is derived from.
--
-- Status/type/impact are text + CHECK rather than new enum types on purpose:
-- adding a value later is a one-line constraint change instead of an enum
-- migration, and this file stays re-runnable.
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------- Tables ----------
create table if not exists public.contributions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references public.profiles(id) on delete set null,
  employee_id   text not null,
  employee_name text not null,
  department    text not null default '',
  title         text not null,
  detail        text not null default '',
  -- What kind of work this was. Weighted in the scoring engine.
  type          text not null default 'delivery'
                check (type in ('delivery', 'fix', 'improvement', 'mentoring',
                                'documentation', 'initiative', 'support')),
  impact        text not null default 'medium'
                check (impact in ('low', 'medium', 'high')),
  occurred_on   date not null default current_date,
  -- Optional evidence pointer (PR, ticket, doc). Makes a claim checkable.
  link          text not null default '',
  status        text not null default 'claimed'
                check (status in ('claimed', 'verified', 'rejected')),
  verified_by   text not null default '',
  verified_at   timestamptz,
  -- How the row arrived: self-logged, entered by HR, or parsed in-browser
  -- from a work-data export the admin dropped on the page.
  source        text not null default 'self'
                check (source in ('self', 'hr', 'import')),
  created_at    timestamptz not null default now()
);

create table if not exists public.bonus_awards (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references public.profiles(id) on delete set null,
  employee_id   text not null,
  employee_name text not null,
  -- Review window this award was decided for, e.g. '2026-Q3' or 'Aug 2026'.
  period        text not null,
  amount        numeric(12, 2) not null default 0,
  -- Contribution score at the moment of the decision, kept for audit.
  score         numeric(8, 2) not null default 0,
  rank          integer,
  kind          text not null default 'bonus'
                check (kind in ('bonus', 'award')),
  -- Why this person: the decomposed reasoning shown when it was approved.
  reason        text not null default '',
  decided_by    text not null default '',
  created_at    timestamptz not null default now(),
  unique (employee_id, period, kind)
);

-- ---------- Row level security ----------
alter table public.contributions enable row level security;
alter table public.bonus_awards  enable row level security;

-- Contribution evidence is readable by everyone signed in: the whole point is
-- that the basis for a bonus is not a secret. Matches leave/attendance reads.
create policy "contrib_read" on public.contributions for select to authenticated using (true);

-- You may log your own contributions; HR may log anyone's.
create policy "contrib_insert" on public.contributions for insert to authenticated
  with check (public.owns_profile(profile_id) or public.is_admin());

-- Only HR verifies or rejects — an employee cannot mark their own work verified.
create policy "contrib_update" on public.contributions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "contrib_delete" on public.contributions for delete to authenticated
  using (public.is_admin());

-- Money is not public: you see your own awards, HR sees everyone's.
create policy "bonus_read" on public.bonus_awards for select to authenticated
  using (public.owns_profile(profile_id) or public.is_admin());

create policy "bonus_write" on public.bonus_awards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Indexes ----------
create index if not exists idx_contrib_employee on public.contributions (employee_id);
create index if not exists idx_contrib_status   on public.contributions (status);
create index if not exists idx_contrib_date     on public.contributions (occurred_on desc);
create index if not exists idx_bonus_period     on public.bonus_awards (period);

-- ---------- Realtime ----------
alter table public.contributions replica identity full;
alter table public.bonus_awards  replica identity full;

do $$
declare
  t text;
  tables text[] := array['contributions', 'bonus_awards'];
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
