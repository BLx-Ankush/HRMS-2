-- ============================================================================
-- Dayflow HRMS (HRMS2) — initial schema (Supabase Postgres + Auth + RLS)
-- Run in the Supabase SQL Editor, then scripts/seed-users.mjs, then seed.sql.
-- ============================================================================

-- ---------- Enums ----------
do $$ begin create type user_role as enum ('employee','admin');
exception when duplicate_object then null; end $$;

do $$ begin create type employee_status as enum ('active','inactive','on_leave');
exception when duplicate_object then null; end $$;

do $$ begin create type attendance_status as enum ('present','absent','late','half-day','leave','holiday','weekend');
exception when duplicate_object then null; end $$;

do $$ begin create type leave_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

do $$ begin create type payroll_status as enum ('paid','pending','processing');
exception when duplicate_object then null; end $$;

-- ---------- Tables ----------
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete cascade,
  employee_id text unique not null,
  name        text not null,
  email       text not null,
  role        user_role not null default 'employee',
  department  text not null default 'Unassigned',
  position    text not null default 'New Employee',
  phone       text not null default '',
  address     text not null default '',
  join_date   date not null default current_date,
  avatar      text,
  about       text not null default '',
  skills      text[] not null default '{}',
  status      employee_status not null default 'active',
  created_at  timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references public.profiles(id) on delete set null,
  employee_id   text not null,
  employee_name text not null,
  type          text not null,
  start_date    date not null,
  end_date      date not null,
  days          integer not null,
  reason        text not null default '',
  status        leave_status not null default 'pending',
  applied_on    date not null default current_date,
  created_at    timestamptz not null default now()
);

create table if not exists public.attendance (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references public.profiles(id) on delete set null,
  employee_id   text not null,
  employee_name text not null,
  department    text not null default '',
  date          date not null,
  check_in      text,
  check_out     text,
  work_hours    text,
  extra_hours   text,
  status        attendance_status not null default 'present',
  created_at    timestamptz not null default now(),
  unique (employee_id, date)
);

create table if not exists public.time_off_requests (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references public.profiles(id) on delete set null,
  employee_id   text not null,
  employee_name text not null,
  type          text not null,
  start_date    date not null,
  end_date      date not null,
  status        leave_status not null default 'pending',
  created_at    timestamptz not null default now()
);

create table if not exists public.payroll (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references public.profiles(id) on delete set null,
  employee_id   text not null,
  employee_name text not null,
  department    text not null default '',
  month         text not null,
  basic_salary  numeric not null default 0,
  allowances    numeric not null default 0,
  deductions    numeric not null default 0,
  net_salary    numeric not null default 0,
  status        payroll_status not null default 'pending',
  paid_on       date,
  created_at    timestamptz not null default now()
);

create table if not exists public.employee_salaries (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid references public.profiles(id) on delete set null,
  employee_id        text unique not null,
  basic_salary       numeric not null default 0,
  hra                numeric not null default 0,
  standard_allowance numeric not null default 0,
  performance_bonus  numeric not null default 0,
  lta                numeric not null default 0,
  fixed_allowance    numeric not null default 0,
  pf_employee        numeric not null default 0,
  pf_employer        numeric not null default 0,
  professional_tax   numeric not null default 0,
  updated_at         timestamptz not null default now()
);

-- Singleton config row (id is fixed so upserts always target the same row).
create table if not exists public.company_salary_structure (
  id                 integer primary key default 1,
  month_wage         numeric not null default 0,
  yearly_wage        numeric not null default 0,
  working_days       integer not null default 5,
  break_time         integer not null default 1,
  components         jsonb not null default '[]'::jsonb,
  pf_employee_amount numeric not null default 0,
  pf_employee_pct    text not null default '',
  pf_employer_amount numeric not null default 0,
  pf_employer_pct    text not null default '',
  professional_tax   numeric not null default 0,
  updated_at         timestamptz not null default now(),
  constraint company_salary_singleton check (id = 1)
);

create table if not exists public.activities (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,
  actor_name text not null,
  action     text not null,
  created_at timestamptz not null default now()
);

-- ---------- Helper functions (SECURITY DEFINER to avoid RLS recursion) ----------
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.owns_profile(pid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = pid and user_id = auth.uid());
$$;

-- ---------- Signup trigger: build a profile from auth metadata ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_emp  text := coalesce(new.raw_user_meta_data->>'employee_id', 'EMP' || substr(new.id::text, 1, 6));
  v_name text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_role user_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'employee');
begin
  update public.profiles
     set user_id = new.id, email = new.email, name = v_name, role = v_role
   where employee_id = v_emp and user_id is null;
  if not found then
    insert into public.profiles (user_id, employee_id, name, email, role)
    values (new.id, v_emp, v_name, new.email, v_role)
    on conflict (employee_id) do update set user_id = excluded.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Row Level Security ----------
alter table public.profiles                 enable row level security;
alter table public.leave_requests           enable row level security;
alter table public.attendance               enable row level security;
alter table public.time_off_requests        enable row level security;
alter table public.payroll                  enable row level security;
alter table public.employee_salaries        enable row level security;
alter table public.company_salary_structure enable row level security;
alter table public.activities               enable row level security;

create policy "profiles_read"   on public.profiles for select to authenticated using (true);
create policy "profiles_update" on public.profiles for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy "profiles_insert" on public.profiles for insert to authenticated
  with check (public.is_admin());

create policy "leave_read"   on public.leave_requests for select to authenticated using (true);
create policy "leave_insert" on public.leave_requests for insert to authenticated
  with check (public.owns_profile(profile_id) or public.is_admin());
create policy "leave_update" on public.leave_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "leave_delete" on public.leave_requests for delete to authenticated
  using (public.is_admin());

create policy "att_read"   on public.attendance for select to authenticated using (true);
create policy "att_insert" on public.attendance for insert to authenticated
  with check (public.owns_profile(profile_id) or public.is_admin());
create policy "att_update" on public.attendance for update to authenticated
  using (public.owns_profile(profile_id) or public.is_admin())
  with check (public.owns_profile(profile_id) or public.is_admin());

create policy "timeoff_read"   on public.time_off_requests for select to authenticated using (true);
create policy "timeoff_insert" on public.time_off_requests for insert to authenticated
  with check (public.owns_profile(profile_id) or public.is_admin());
create policy "timeoff_update" on public.time_off_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "pay_read"  on public.payroll for select to authenticated using (true);
create policy "pay_write" on public.payroll for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "empsal_read"  on public.employee_salaries for select to authenticated using (true);
create policy "empsal_write" on public.employee_salaries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "coysal_read"  on public.company_salary_structure for select to authenticated using (true);
create policy "coysal_write" on public.company_salary_structure for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "act_read"   on public.activities for select to authenticated using (true);
create policy "act_insert" on public.activities for insert to authenticated with check (true);

-- ---------- Indexes ----------
create index if not exists idx_leave_status on public.leave_requests (status);
create index if not exists idx_att_date     on public.attendance (date);
create index if not exists idx_timeoff_stat on public.time_off_requests (status);
create index if not exists idx_pay_employee on public.payroll (employee_id);
create index if not exists idx_act_created  on public.activities (created_at desc);
