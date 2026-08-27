-- ============================================================================
-- Dayflow HRMS (HRMS2) — seed data
-- Run AFTER scripts/seed-users.mjs (so EMP001/EMP002 auth profiles exist).
-- Safe to re-run: uses upserts / conflict handling where practical.
-- ============================================================================

-- ---------- Flesh out the two auth-linked profiles ----------
update public.profiles set
  department = 'Human Resources', position = 'HR Manager',
  phone = '+1 (555) 123-4567', address = '123 Corporate Blvd, Suite 100',
  join_date = '2021-03-15', status = 'active',
  about = 'HR Manager focused on people operations and employee experience.',
  skills = array['HR Management','Recruitment','Employee Relations','Performance Management','HRIS Systems']
where employee_id = 'EMP001';

update public.profiles set
  department = 'Engineering', position = 'Software Developer',
  phone = '+1 (555) 987-6543', address = '456 Tech Avenue, Apt 12',
  join_date = '2022-06-01', status = 'active',
  about = 'Full-stack developer who enjoys building reliable web apps.',
  skills = array['TypeScript','React','Node.js','PostgreSQL','System Design']
where employee_id = 'EMP002';

-- ---------- Roster-only employees (no login) ----------
insert into public.profiles (employee_id, name, email, role, department, position, phone, address, join_date, status)
values
  ('EMP003', 'Mike Brown',  'mike.brown@dayflow.com',  'employee', 'Engineering', 'Senior Developer',  '+1 (555) 456-7890', '', '2020-09-10', 'active'),
  ('EMP004', 'Emily Davis', 'emily.davis@dayflow.com', 'employee', 'Design',      'UI/UX Designer',    '+1 (555) 321-0987', '', '2023-01-20', 'on_leave'),
  ('EMP005', 'Alex Wilson', 'alex.wilson@dayflow.com', 'employee', 'Marketing',   'Marketing Manager', '+1 (555) 654-3210', '', '2021-11-05', 'active'),
  ('EMP006', 'Lisa Chen',   'lisa.chen@dayflow.com',   'employee', 'Finance',     'Financial Analyst', '+1 (555) 789-0123', '', '2022-04-15', 'active')
on conflict (employee_id) do nothing;

-- ---------- Leave requests ----------
insert into public.leave_requests (profile_id, employee_id, employee_name, type, start_date, end_date, days, reason, status, applied_on)
select p.id, v.employee_id, v.employee_name, v.type, v.start_date, v.end_date, v.days, v.reason, v.status::leave_status, v.applied_on
from (values
  ('EMP002', 'John Smith',  'Paid Leave',   date '2026-01-10', date '2026-01-12', 3, 'Family vacation',    'pending',  date '2026-01-03'),
  ('EMP003', 'Mike Brown',  'Sick Leave',   date '2026-01-05', date '2026-01-05', 1, 'Doctor appointment', 'pending',  date '2026-01-02'),
  ('EMP004', 'Emily Davis', 'Unpaid Leave', date '2025-12-20', date '2025-12-24', 5, 'Personal matters',   'approved', date '2025-12-15'),
  ('EMP002', 'John Smith',  'Sick Leave',   date '2025-12-01', date '2025-12-01', 1, 'Not feeling well',   'approved', date '2025-12-01')
) as v(employee_id, employee_name, type, start_date, end_date, days, reason, status, applied_on)
left join public.profiles p on p.employee_id = v.employee_id;

-- ---------- Attendance: everyone, last 5 weekdays through today ----------
-- Generates present/late rows for all 6 employees across recent business days,
-- so the admin date navigation always has data and "Present Today" is populated.
insert into public.attendance (profile_id, employee_id, employee_name, department, date, check_in, check_out, work_hours, extra_hours, status)
select p.id, p.employee_id, p.name, p.department, d.day,
       case when p.employee_id = 'EMP004' then null else '09:00' end,
       case when p.employee_id = 'EMP004' then null
            when d.day = current_date then null else '18:00' end,
       case when p.employee_id = 'EMP004' then null
            when d.day = current_date then null else '9h 0m' end,
       case when p.employee_id = 'EMP004' then null
            when d.day = current_date then null else '+1h 0m' end,
       (case when p.employee_id = 'EMP004' then 'leave'
             when p.employee_id = 'EMP003' then 'late'
             else 'present' end)::attendance_status
from public.profiles p
cross join lateral (
  select gs::date as day
  from generate_series(current_date - interval '6 days', current_date, interval '1 day') gs
  where extract(dow from gs) between 1 and 5
) d
on conflict (employee_id, date) do nothing;

-- ---------- Time-off requests (admin Time Off view) ----------
insert into public.time_off_requests (profile_id, employee_id, employee_name, type, start_date, end_date, status)
select p.id, v.employee_id, v.employee_name, v.type, v.start_date, v.end_date, v.status::leave_status
from (values
  ('EMP002', 'John Smith',  'Paid Time Off', date '2025-10-28', date '2025-10-28', 'approved'),
  ('EMP004', 'Emily Davis', 'Sick Leave',    date '2025-11-05', date '2025-11-07', 'approved'),
  ('EMP003', 'Mike Brown',  'Unpaid Leave',  date '2025-11-12', date '2025-11-15', 'approved')
) as v(employee_id, employee_name, type, start_date, end_date, status)
left join public.profiles p on p.employee_id = v.employee_id;

-- ---------- Payroll: EMP002 personal history (INR, matches EMP002 salary structure) ----------
insert into public.payroll (profile_id, employee_id, employee_name, department, month, basic_salary, allowances, deductions, net_salary, status, paid_on)
select p.id, 'EMP002', 'John Smith', 'Engineering', v.month, v.basic, v.allow, v.deduct, v.net, v.status::payroll_status, v.paid_on
from (values
  ('December 2025', 28000, 25251, 3200, 50051, 'paid', date '2025-12-31'),
  ('November 2025', 28000, 25251, 3200, 50051, 'paid', date '2025-11-30'),
  ('October 2025',  28000, 25251, 3200, 50051, 'paid', date '2025-10-31')
) as v(month, basic, allow, deduct, net, status, paid_on)
left join public.profiles p on p.employee_id = 'EMP002';

-- ---------- Payroll: current month for ALL employees ----------
-- Values are derived from each employee's salary structure below
-- (allowances = HRA + 11,251 fixed components; deductions = 3,000 PF + 200 PT),
-- so they stay consistent with what the admin "Generate" button produces.
insert into public.payroll (profile_id, employee_id, employee_name, department, month, basic_salary, allowances, deductions, net_salary, status, paid_on)
select p.id, v.employee_id, v.employee_name, v.department,
       to_char(current_date, 'FMMonth YYYY'), v.basic, v.allow, v.deduct, v.net, v.status::payroll_status, null
from (values
  ('EMP001', 'Sarah Johnson', 'Human Resources', 30000, 26251, 3200, 53051, 'paid'),
  ('EMP002', 'John Smith',    'Engineering',     28000, 25251, 3200, 50051, 'pending'),
  ('EMP003', 'Mike Brown',    'Engineering',     25000, 23751, 3200, 45551, 'pending'),
  ('EMP004', 'Emily Davis',   'Design',          32000, 27251, 3200, 56051, 'pending'),
  ('EMP005', 'Alex Wilson',   'Marketing',       27000, 24751, 3200, 48551, 'paid'),
  ('EMP006', 'Lisa Chen',     'Finance',         26000, 24251, 3200, 47051, 'processing')
) as v(employee_id, employee_name, department, basic, allow, deduct, net, status)
left join public.profiles p on p.employee_id = v.employee_id;

-- ---------- Per-employee salary structure (SalaryInfo employee tab, INR) ----------
insert into public.employee_salaries (profile_id, employee_id, basic_salary, hra, standard_allowance, performance_bonus, lta, fixed_allowance, pf_employee, pf_employer, professional_tax)
select p.id, v.employee_id, v.basic, v.hra, 4167, 2083, 2083, 2918, 3000, 3000, 200
from (values
  ('EMP001', 30000, 15000),
  ('EMP002', 28000, 14000),
  ('EMP003', 25000, 12500),
  ('EMP004', 32000, 16000),
  ('EMP005', 27000, 13500),
  ('EMP006', 26000, 13000)
) as v(employee_id, basic, hra)
left join public.profiles p on p.employee_id = v.employee_id
on conflict (employee_id) do nothing;

-- ---------- Company salary structure (SalaryInfo company tab, singleton row) ----------
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

-- ---------- Recent activity feed ----------
insert into public.activities (type, actor_name, action, created_at) values
  ('leave',      'John Smith',    'requested sick leave', now() - interval '2 hours'),
  ('attendance', 'Sarah Johnson', 'checked in',           now() - interval '3 hours'),
  ('leave',      'Mike Brown',    'leave approved',        now() - interval '5 hours'),
  ('welcome',    'Emily Davis',   'joined the team',       now() - interval '1 day');
