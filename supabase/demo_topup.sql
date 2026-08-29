-- ============================================================================
-- Dayflow HRMS (HRMS2) — demo top-up
--
-- PURELY ADDITIVE. This script never deletes, never renames, and never touches
-- an auth-linked profile's name, email, user_id or role. Every insert is guarded
-- by ON CONFLICT or NOT EXISTS, so running it twice changes nothing the second
-- time and existing data is left exactly as it is.
--
-- What it does, in order:
--   1. creates contributions / bonus_awards if 0003 was never applied
--   2. inserts the missing company_salary_structure singleton (the zeros)
--   3. adds six login-less employees EMP008-EMP013, mixed Indian and American
--   4. fills them into every section — salary, payroll, attendance, leave,
--      time off, contributions, activity feed
--   5. gives EMP003 an APPROVED business-travel request covering today, so the
--      expense audit can clear travel spend instead of holding it
--
-- Run the whole thing in the Supabase SQL Editor in one go.
-- ============================================================================

-- ------------------------------------------------------------- 1. tables ----
-- No-ops if 0003_contributions.sql has already been applied.

create table if not exists public.contributions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references public.profiles(id) on delete set null,
  employee_id   text not null,
  employee_name text not null,
  department    text not null default '',
  title         text not null,
  detail        text not null default '',
  type          text not null default 'delivery'
                check (type in ('delivery', 'fix', 'improvement', 'mentoring',
                                'documentation', 'initiative', 'support')),
  impact        text not null default 'medium'
                check (impact in ('low', 'medium', 'high')),
  occurred_on   date not null default current_date,
  link          text not null default '',
  status        text not null default 'claimed'
                check (status in ('claimed', 'verified', 'rejected')),
  verified_by   text not null default '',
  verified_at   timestamptz,
  source        text not null default 'self'
                check (source in ('self', 'hr', 'import')),
  created_at    timestamptz not null default now()
);

create table if not exists public.bonus_awards (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references public.profiles(id) on delete set null,
  employee_id   text not null,
  employee_name text not null,
  period        text not null,
  amount        numeric(12, 2) not null default 0,
  score         numeric(8, 2) not null default 0,
  rank          integer,
  kind          text not null default 'bonus'
                check (kind in ('bonus', 'award')),
  reason        text not null default '',
  decided_by    text not null default '',
  created_at    timestamptz not null default now(),
  unique (employee_id, period, kind)
);

alter table public.contributions enable row level security;
alter table public.bonus_awards  enable row level security;

-- Dropped first so this file is re-runnable; CREATE POLICY has no IF NOT EXISTS.
drop policy if exists "contrib_read"   on public.contributions;
drop policy if exists "contrib_insert" on public.contributions;
drop policy if exists "contrib_update" on public.contributions;
drop policy if exists "contrib_delete" on public.contributions;
drop policy if exists "bonus_read"     on public.bonus_awards;
drop policy if exists "bonus_write"    on public.bonus_awards;

create policy "contrib_read" on public.contributions for select to authenticated using (true);
create policy "contrib_insert" on public.contributions for insert to authenticated
  with check (public.owns_profile(profile_id) or public.is_admin());
create policy "contrib_update" on public.contributions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "contrib_delete" on public.contributions for delete to authenticated
  using (public.is_admin());
create policy "bonus_read" on public.bonus_awards for select to authenticated
  using (public.owns_profile(profile_id) or public.is_admin());
create policy "bonus_write" on public.bonus_awards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create index if not exists idx_contrib_employee on public.contributions (employee_id);
create index if not exists idx_contrib_status   on public.contributions (status);
create index if not exists idx_contrib_date     on public.contributions (occurred_on desc);
create index if not exists idx_bonus_period     on public.bonus_awards (period);

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

-- ------------------------------------------- 2. company salary structure ----
-- The Salary Structure page reads exactly one row, id = 1. When it is absent
-- every field on the Company tab renders 0 and the salary proposal falls back
-- to statutory defaults. This puts it back. ON CONFLICT DO NOTHING, so a row
-- you have already configured by hand is never overwritten.

insert into public.company_salary_structure
  (id, month_wage, yearly_wage, working_days, break_time, components,
   pf_employee_amount, pf_employee_pct, pf_employer_amount, pf_employer_pct, professional_tax)
values (1, 50000, 600000, 5, 1,
  '[
    {"name":"Basic Salary","amount":25000,"description":"Base salary component","percentage":""},
    {"name":"House Rent Allowance","amount":12500,"description":"50% of basic salary","percentage":""},
    {"name":"Standard Allowance","amount":4167,"description":"Fixed monthly allowance","percentage":"16.67%"},
    {"name":"Performance Bonus","amount":2083,"description":"Performance-based incentive","percentage":"8.33%"},
    {"name":"Leave Travel Allowance","amount":2083,"description":"Travel expense allowance","percentage":"8.33%"},
    {"name":"Fixed Allowance","amount":2918,"description":"Additional fixed component","percentage":"11.67%"}
  ]'::jsonb,
  3000, '12.00%', 3000, '12.00%', 200)
on conflict (id) do nothing;

-- ---------------------------------------------------- 3. new employees ------
-- Login-less roster rows (user_id stays null), so no auth user is created and
-- nothing about sign-in changes. EMP001-EMP007 are untouched.
--
-- EMP012 Rohan Deshpande deliberately gets NO salary row and NO payroll row:
-- he is the target for the on-camera salary proposal, so the panel warns
-- "creates their first structure" rather than reading as a revision.

insert into public.profiles
  (employee_id, name, email, role, department, position, phone, address, join_date, status, about, skills)
values
  ('EMP008', 'Priya Raghavan',   'priya.raghavan@dayflow.com',   'employee', 'Engineering',     'Backend Developer',     '+91 98450 11234', 'Indiranagar, Bengaluru',  '2023-08-16', 'active',
   'Builds and hardens the payroll and attendance services.',
   array['Python','PostgreSQL','Django','Redis','API Design']),
  ('EMP009', 'Daniel Whitaker',  'daniel.whitaker@dayflow.com',  'employee', 'Sales',           'Account Executive',     '+1 (555) 274-8890', '88 Harbor Street, Boston', '2022-02-07', 'active',
   'Runs mid-market accounts end to end.',
   array['Enterprise Sales','Negotiation','CRM','Forecasting']),
  ('EMP010', 'Meera Nair',       'meera.nair@dayflow.com',       'employee', 'Design',          'Product Designer',      '+91 99005 44821', 'Kochi, Kerala',           '2024-01-08', 'active',
   'Designs the employee-facing surfaces of the product.',
   array['Figma','Design Systems','User Research','Prototyping','Accessibility']),
  ('EMP011', 'Grace Whitman',    'grace.whitman@dayflow.com',    'employee', 'Human Resources', 'Talent Partner',        '+1 (555) 903-1147', '12 Elmwood Court, Austin', '2021-06-21', 'on_leave',
   'Hiring and onboarding across engineering and design.',
   array['Recruitment','Onboarding','Employer Branding','Interview Design']),
  ('EMP012', 'Rohan Deshpande',  'rohan.deshpande@dayflow.com',  'employee', 'Engineering',     'DevOps Engineer',       '+91 90220 76543', 'Pune, Maharashtra',       '2024-11-04', 'active',
   'Owns deployment, monitoring and the release pipeline.',
   array['Docker','Kubernetes','CI/CD','Terraform','Observability']),
  ('EMP013', 'Nathan Brooks',    'nathan.brooks@dayflow.com',    'employee', 'Support',         'Customer Success Lead', '+1 (555) 618-2205', '404 Pinecrest Ave, Denver','2023-03-27', 'active',
   'First responder for customer issues and escalations.',
   array['Customer Success','Zendesk','Escalation Management','Documentation'])
on conflict (employee_id) do nothing;

-- --------------------------------------------- 4. per-employee salaries ------
-- Same component shape as the existing seed: standard 4167, performance 2083,
-- LTA 2083, fixed 2918, PF 3000 both sides, professional tax 200.
-- EMP012 is absent on purpose (see above).

insert into public.employee_salaries
  (profile_id, employee_id, basic_salary, hra, standard_allowance, performance_bonus,
   lta, fixed_allowance, pf_employee, pf_employer, professional_tax)
select p.id, v.employee_id, v.basic, v.hra, 4167, 2083, 2083, 2918, 3000, 3000, 200
from (values
  ('EMP008', 34000, 17000),
  ('EMP009', 31000, 15500),
  ('EMP010', 33000, 16500),
  ('EMP011', 24000, 12000),
  ('EMP013', 28500, 14250)
) as v(employee_id, basic, hra)
left join public.profiles p on p.employee_id = v.employee_id
on conflict (employee_id) do nothing;

-- ------------------------------------------------------------ 5. payroll -----
-- allowances = HRA + 11,251 fixed components; deductions = 3,000 PF + 200 PT;
-- net = basic + allowances - deductions. Consistent with the salary rows above,
-- which is what the admin "Generate" button reproduces.

insert into public.payroll
  (profile_id, employee_id, employee_name, department, month, basic_salary,
   allowances, deductions, net_salary, status, paid_on)
select p.id, v.employee_id, coalesce(p.name, v.employee_name),
       coalesce(p.department, v.department), to_char(current_date, 'FMMonth YYYY'),
       v.basic, v.allow, v.deduct, v.net, v.status::payroll_status, null
from (values
  ('EMP008', 'Priya Raghavan',  'Engineering',     34000, 28251, 3200, 59051, 'pending'),
  ('EMP009', 'Daniel Whitaker', 'Sales',           31000, 26751, 3200, 54551, 'paid'),
  ('EMP010', 'Meera Nair',      'Design',          33000, 27751, 3200, 57551, 'pending'),
  ('EMP011', 'Grace Whitman',   'Human Resources', 24000, 23251, 3200, 44051, 'processing'),
  ('EMP013', 'Nathan Brooks',   'Support',         28500, 25501, 3200, 50801, 'pending')
) as v(employee_id, employee_name, department, basic, allow, deduct, net, status)
left join public.profiles p on p.employee_id = v.employee_id
where not exists (
  select 1 from public.payroll pr
  where pr.employee_id = v.employee_id and pr.month = to_char(current_date, 'FMMonth YYYY')
);

-- --------------------------------------------------------- 6. attendance -----
-- Regenerates the last seven days' weekdays for EVERY profile, new and old.
-- ON CONFLICT (employee_id, date) DO NOTHING, so existing rows are never
-- rewritten — this only fills gaps, including days that have passed since the
-- original seed was run.
--
-- Deliberate variety: EMP004 and EMP011 are on leave (no times at all),
-- EMP007 and EMP009 are late, EMP012 works half days. Note that EMP007 stays
-- flagged late while remaining the top contributor — that contrast is the whole
-- argument of the Bonuses screen, so do not "tidy" it.

insert into public.attendance
  (profile_id, employee_id, employee_name, department, date, check_in, check_out,
   work_hours, extra_hours, status)
select p.id, p.employee_id, p.name, p.department, d.day,
       case when p.employee_id in ('EMP004','EMP011') then null
            when p.employee_id = 'EMP009' then '09:41'
            else '09:00' end,
       case when p.employee_id in ('EMP004','EMP011') then null
            when d.day = current_date then null
            when p.employee_id = 'EMP012' then '13:30'
            else '18:00' end,
       case when p.employee_id in ('EMP004','EMP011') then null
            when d.day = current_date then null
            when p.employee_id = 'EMP012' then '4h 30m'
            when p.employee_id = 'EMP009' then '8h 19m'
            else '9h 0m' end,
       case when p.employee_id in ('EMP004','EMP011') then null
            when d.day = current_date then null
            when p.employee_id in ('EMP012','EMP009') then null
            else '+1h 0m' end,
       (case when p.employee_id in ('EMP004','EMP011') then 'leave'
             when p.employee_id in ('EMP007','EMP009') then 'late'
             when p.employee_id = 'EMP012' then 'half-day'
             else 'present' end)::attendance_status
from public.profiles p
cross join lateral (
  select gs::date as day
  from generate_series(current_date - interval '6 days', current_date, interval '1 day') gs
  where extract(dow from gs) between 1 and 5
) d
on conflict (employee_id, date) do nothing;

-- ---------------------------------------------------- 7. leave requests ------
-- The EMP003 row is the one that matters for the expense demo. audit_expense_claim
-- looks for a leave_requests row for the traveller whose dates overlap the claim
-- and whose status matches /approve/i; without one, travel and conference spend is
-- HELD FOR REVIEW instead of cleared. This gives the owner's own account an
-- approved business-travel window spanning today, so either narration is available.
-- Dates are relative to when you run this, so it stays true whenever you record.

insert into public.leave_requests
  (profile_id, employee_id, employee_name, type, start_date, end_date, days, reason, status, applied_on)
select p.id, v.employee_id, coalesce(p.name, v.employee_name), v.type,
       v.start_date, v.end_date, v.days, v.reason, v.status::leave_status, v.applied_on
from (values
  ('EMP003', 'Ankush',           'Business Travel', current_date - 5,  current_date + 5,  11, 'Client meetings and partner conference, Bengaluru', 'approved', current_date - 12),
  ('EMP008', 'Priya Raghavan',   'Paid Leave',      current_date + 7,  current_date + 9,  3,  'Family function',                                   'pending',  current_date - 1),
  ('EMP009', 'Daniel Whitaker',  'Sick Leave',      current_date - 1,  current_date - 1,  1,  'Migraine',                                          'pending',  current_date - 1),
  ('EMP011', 'Grace Whitman',    'Unpaid Leave',    current_date - 3,  current_date + 4,  8,  'Personal matters',                                  'approved', current_date - 9),
  ('EMP012', 'Rohan Deshpande',  'Business Travel', current_date + 14, current_date + 16, 3,  'Infrastructure vendor review, Hyderabad',           'pending',  current_date - 2),
  ('EMP013', 'Nathan Brooks',    'Paid Leave',      current_date + 21, current_date + 25, 5,  'Annual holiday',                                    'pending',  current_date)
) as v(employee_id, employee_name, type, start_date, end_date, days, reason, status, applied_on)
left join public.profiles p on p.employee_id = v.employee_id
where not exists (
  select 1 from public.leave_requests lr
  where lr.employee_id = v.employee_id and lr.type = v.type and lr.start_date = v.start_date
);

-- ------------------------------------------------- 8. time-off requests ------

insert into public.time_off_requests
  (profile_id, employee_id, employee_name, type, start_date, end_date, status)
select p.id, v.employee_id, coalesce(p.name, v.employee_name), v.type,
       v.start_date, v.end_date, v.status::leave_status
from (values
  ('EMP008', 'Priya Raghavan',  'Paid Time Off', current_date + 20, current_date + 21, 'pending'),
  ('EMP010', 'Meera Nair',      'Paid Time Off', current_date + 10, current_date + 10, 'pending'),
  ('EMP012', 'Rohan Deshpande', 'Sick Leave',    current_date - 11, current_date - 10, 'approved'),
  ('EMP013', 'Nathan Brooks',   'Sick Leave',    current_date - 8,  current_date - 7,  'approved')
) as v(employee_id, employee_name, type, start_date, end_date, status)
left join public.profiles p on p.employee_id = v.employee_id
where not exists (
  select 1 from public.time_off_requests t
  where t.employee_id = v.employee_id and t.type = v.type and t.start_date = v.start_date
);

-- ------------------------------------------------------- 9. contributions ----
-- Deliberately calibrated. Verified points are type weight x impact weight
-- (delivery/initiative 1, fix/improvement 0.9, mentoring 0.8, documentation 0.7,
-- support 0.6; low 1, medium 2, high 3.5). EMP007 Mike Brown scores 10.05 today.
-- The highest new scorer is EMP012 Rohan Deshpande at 6.65, rising to 9.8 if you
-- verify his pending claim on camera — so the leaderboard moves visibly without
-- ever displacing EMP007, whose "late every day, still top" contrast is the point
-- of the screen. Dates are relative, so everything stays inside the 90-day window
-- whenever you record.

insert into public.contributions
  (profile_id, employee_id, employee_name, department, title, detail, type, impact,
   occurred_on, link, status, verified_by, verified_at, source)
select p.id, v.employee_id, coalesce(p.name, v.employee_name), coalesce(p.department, ''),
       v.title, v.detail, v.type, v.impact, v.occurred_on, v.link, v.status,
       case when v.status = 'verified' then 'Sarah Johnson' else '' end,
       case when v.status = 'verified' then v.occurred_on + interval '2 days' else null end,
       v.source
from (values
  -- EMP008 Priya Raghavan — 5.3 verified, 1.8 waiting on HR.
  ('EMP008', 'Priya Raghavan',  'Shipped the bulk payroll import',            'Finance now uploads a month in one pass instead of 40 forms.', 'delivery',    'high',   current_date - 14, 'https://github.com/BLx-Ankush/HRMS-2/pull/141', 'verified', 'self'),
  ('EMP008', 'Priya Raghavan',  'Fixed the leave-balance rounding error',      'Half-days were being counted twice at month boundaries.',      'fix',         'medium', current_date - 33, 'https://github.com/BLx-Ankush/HRMS-2/pull/133', 'verified', 'self'),
  ('EMP008', 'Priya Raghavan',  'Cut attendance API latency by half',          'Replaced per-row lookups with a single batched query.',        'improvement', 'medium', current_date - 6,  'https://github.com/BLx-Ankush/HRMS-2/pull/149', 'claimed',  'self'),

  -- EMP009 Daniel Whitaker — 4.7 verified, 2.0 waiting.
  ('EMP009', 'Daniel Whitaker', 'Closed the Meridian Health account',          'Largest mid-market contract of the quarter.',                  'delivery',    'high',   current_date - 20, '',                                             'verified', 'hr'),
  ('EMP009', 'Daniel Whitaker', 'Ran the renewals desk single-handed',         'Covered a colleague on leave for three weeks.',                'support',     'medium', current_date - 45, '',                                             'verified', 'hr'),
  ('EMP009', 'Daniel Whitaker', 'Built the objection-handling playbook',       'Used by the whole team, not yet reviewed by HR.',              'delivery',    'medium', current_date - 4,  '',                                             'claimed',  'self'),

  -- EMP010 Meera Nair — 6.0 verified, all reviewed.
  ('EMP010', 'Meera Nair',      'Redesigned the leave request flow',           'Cut the steps from seven to three; tested with nine employees.','delivery',   'high',   current_date - 17, '',                                             'verified', 'self'),
  ('EMP010', 'Meera Nair',      'Made every table keyboard navigable',         'Full tab order and visible focus rings across the console.',    'improvement','medium', current_date - 38, '',                                             'verified', 'self'),
  ('EMP010', 'Meera Nair',      'Wrote the component usage guide',             'What to use when, with the reasoning.',                         'documentation','low',  current_date - 52, '',                                             'verified', 'hr'),

  -- EMP011 Grace Whitman — 3.0 verified. Low score, genuinely valuable work:
  -- exactly the case the disclosure text warns about. Good narration material.
  ('EMP011', 'Grace Whitman',   'Onboarded five new joiners',                  'Ran every first-week session personally.',                      'mentoring',  'medium', current_date - 25, '',                                             'verified', 'hr'),
  ('EMP011', 'Grace Whitman',   'Rewrote the interview scorecards',            'Same questions, same rubric, every candidate.',                  'documentation','medium',current_date - 47, '',                                            'verified', 'self'),
  ('EMP011', 'Grace Whitman',   'Answered the benefits inbox all quarter',     'Roughly 200 queries. Nobody else was doing it.',                'support',    'low',    current_date - 9,  '',                                             'claimed',  'self'),

  -- EMP012 Rohan Deshpande — 6.65 verified, 3.15 pending. Verify the pending one
  -- on camera and he climbs to 9.8, still second to EMP007.
  ('EMP012', 'Rohan Deshpande', 'Built the zero-downtime deploy pipeline',     'Releases went from a scheduled outage to a non-event.',          'initiative', 'high',   current_date - 11, 'https://github.com/BLx-Ankush/HRMS-2/pull/137', 'verified', 'self'),
  ('EMP012', 'Rohan Deshpande', 'Fixed the nightly backup that was silently failing', 'Nine days of backups did not exist. Now alerted on.',    'fix',        'high',   current_date - 29, '',                                             'verified', 'hr'),
  ('EMP012', 'Rohan Deshpande', 'Halved the container image size',             'Cold starts down from 22s to 8s.',                              'improvement','high',   current_date - 3,  'https://github.com/BLx-Ankush/HRMS-2/pull/152', 'claimed',  'self'),

  -- EMP013 Nathan Brooks — 4.1 verified, all support and mentoring.
  ('EMP013', 'Nathan Brooks',   'Cleared the escalation backlog',              'Forty open tickets to zero in two weeks.',                      'support',    'high',   current_date - 22, '',                                             'verified', 'hr'),
  ('EMP013', 'Nathan Brooks',   'Held the on-call pager through the migration','Two weekends, no missed page.',                                 'support',    'medium', current_date - 41, '',                                             'verified', 'hr'),
  ('EMP013', 'Nathan Brooks',   'Coached two agents on escalation handling',    'Both now handle tier-two alone.',                               'mentoring',  'low',    current_date - 56, '',                                             'verified', 'self')
) as v(employee_id, employee_name, title, detail, type, impact, occurred_on, link, status, source)
left join public.profiles p on p.employee_id = v.employee_id
where not exists (
  select 1 from public.contributions c
  where c.employee_id = v.employee_id and c.title = v.title
);

-- ----------------------------------------------------- 10. activity feed -----
-- Neutral history only. Nothing here claims a salary was revised or a claim was
-- reimbursed — those lines must be written live on camera by the tools, or the
-- audit trail is fiction.

insert into public.activities (type, actor_name, action, created_at)
select v.type, v.actor_name, v.action, v.created_at
from (values
  ('welcome',    'Priya Raghavan',  'joined the team',            now() - interval '5 days'),
  ('welcome',    'Rohan Deshpande', 'joined the team',            now() - interval '4 days'),
  ('leave',      'Grace Whitman',   'leave approved',             now() - interval '3 days'),
  ('leave',      'Ankush',          'business travel approved',   now() - interval '12 days'),
  ('attendance', 'Daniel Whitaker', 'checked in late',            now() - interval '6 hours'),
  ('attendance', 'Meera Nair',      'checked in',                 now() - interval '4 hours')
) as v(type, actor_name, action, created_at)
where not exists (
  select 1 from public.activities a
  where a.type = v.type and a.actor_name = v.actor_name and a.action = v.action
);

-- ------------------------------------------------------- 11. verification ----
-- The SQL Editor only shows the LAST result set, so this is one query. Expected
-- after a clean run: 13 profiles, 12 salary rows (EMP012 has none, by design),
-- 1 company structure row, and at least one approved business-travel request
-- for EMP003 covering today.

select 'profiles'                     as what, count(*)::text as value from public.profiles
union all
select 'employee_salaries',                 count(*)::text from public.employee_salaries
union all
select 'company_salary_structure (want 1)', count(*)::text from public.company_salary_structure
union all
select 'payroll this month',                count(*)::text from public.payroll
                                             where month = to_char(current_date, 'FMMonth YYYY')
union all
select 'attendance today',                  count(*)::text from public.attendance
                                             where date = current_date
union all
select 'leave requests',                    count(*)::text from public.leave_requests
union all
select 'time off requests',                 count(*)::text from public.time_off_requests
union all
select 'contributions',                     count(*)::text from public.contributions
union all
select 'contributions verified',            count(*)::text from public.contributions
                                             where status = 'verified'
union all
select 'EMP003 approved travel covering today', count(*)::text from public.leave_requests
                                             where employee_id = 'EMP003'
                                               and status = 'approved'
                                               and start_date <= current_date
                                               and end_date   >= current_date
union all
select 'EMP012 salary rows (want 0)',       count(*)::text from public.employee_salaries
                                             where employee_id = 'EMP012'
order by what;

