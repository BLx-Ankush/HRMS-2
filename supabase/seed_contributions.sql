-- ============================================================================
-- Dayflow HRMS (HRMS2) — demo contribution evidence
-- Run in the Supabase SQL Editor after 0003_contributions.sql.
--
-- Kept separate from seed.sql so you can populate the Bonuses screen without
-- re-running the whole seed. Guarded on (employee_id, title) so re-runs don't
-- duplicate.
--
-- The data is deliberately shaped so the contribution ranking does NOT track
-- attendance or tenure: Mike Brown (EMP007) is flagged 'late' in the attendance
-- seed yet is the strongest contributor, and Emily Davis (EMP004) is on leave
-- with solid verified work. That is the whole argument of the feature — if the
-- ranking simply mirrored who shows up on time, it would be measuring presence.
-- EMP005 has several unverified claims, so his score only moves once HR
-- verifies them.
-- ============================================================================

insert into public.contributions
  (profile_id, employee_id, employee_name, department, title, detail, type, impact, occurred_on, link, status, verified_by, verified_at, source)
select p.id, v.employee_id, coalesce(p.name, v.employee_name), coalesce(p.department, ''),
       v.title, v.detail, v.type, v.impact, v.occurred_on, v.link, v.status,
       case when v.status = 'verified' then 'Sarah Johnson' else '' end,
       case when v.status = 'verified' then v.occurred_on + interval '2 days' else null end,
       v.source
from (values
  -- EMP007 Mike Brown — highest real output, and the one the attendance data
  -- would have unfairly penalised.
  ('EMP007', 'Mike Brown',  'Rebuilt the payroll generation pipeline',        'Cut month-end payroll run from 40 minutes to under 2.', 'delivery',      'high',   date '2026-08-11', 'https://github.com/BLx-Ankush/HRMS-2/pull/128', 'verified', 'self'),
  ('EMP007', 'Mike Brown',  'Fixed the duplicate-attendance race condition',  'Concurrent check-ins were creating two rows per day.',  'fix',           'high',   date '2026-07-29', 'https://github.com/BLx-Ankush/HRMS-2/pull/119', 'verified', 'self'),
  ('EMP007', 'Mike Brown',  'Mentored two new joiners through onboarding',    'Paired daily for their first fortnight.',               'mentoring',     'medium', date '2026-07-14', '',                                             'verified', 'hr'),
  ('EMP007', 'Mike Brown',  'Cut dashboard query time by 60%',                'Added the missing composite index and batched reads.',  'improvement',   'medium', date '2026-06-30', 'https://github.com/BLx-Ankush/HRMS-2/pull/104', 'verified', 'self'),

  -- EMP002 John Smith — steady, verified, slightly behind on impact.
  ('EMP002', 'John Smith',  'Shipped the leave approval workflow',            'End-to-end approve/reject with audit trail.',           'delivery',      'high',   date '2026-08-04', 'https://github.com/BLx-Ankush/HRMS-2/pull/122', 'verified', 'self'),
  ('EMP002', 'John Smith',  'Wrote the HR onboarding runbook',                'Twelve-step checklist now used for every new hire.',    'documentation', 'medium', date '2026-07-21', '',                                             'verified', 'self'),
  ('EMP002', 'John Smith',  'Covered support rotation for two weeks',         'Took the on-call pager while Design was short-staffed.','support',       'medium', date '2026-07-07', '',                                             'verified', 'hr'),
  ('EMP002', 'John Smith',  'Fixed timezone drift in attendance totals',      'Work hours were off by one for non-UTC users.',         'fix',           'low',    date '2026-06-23', 'https://github.com/BLx-Ankush/HRMS-2/pull/98',  'verified', 'self'),

  -- EMP003 Ankush — fewer items, very high impact each.
  ('EMP003', 'Ankush',      'Built the WebMCP agent tool layer',              'Exposed the console to browser agents with approval gating.', 'initiative', 'high',   date '2026-08-24', 'https://github.com/BLx-Ankush/HRMS-2',        'verified', 'self'),
  ('EMP003', 'Ankush',      'Added realtime sync across open tabs',           'Every client updates the moment a record changes.',     'delivery',      'high',   date '2026-08-02', '',                                             'verified', 'self'),
  ('EMP003', 'Ankush',      'Documented the Supabase RLS model',              'Explains every policy and why it exists.',              'documentation', 'low',    date '2026-07-18', '',                                             'claimed',  'self'),

  -- EMP004 Emily Davis — on leave, still strong verified work.
  ('EMP004', 'Emily Davis', 'Redesigned the employee dashboard',              'New layout tested with six employees before ship.',     'delivery',      'high',   date '2026-08-08', '',                                             'verified', 'self'),
  ('EMP004', 'Emily Davis', 'Built the shared component library',             'Twenty-one components, all keyboard accessible.',       'initiative',    'high',   date '2026-07-11', '',                                             'verified', 'self'),
  ('EMP004', 'Emily Davis', 'Fixed contrast failures across six screens',     'Brought the palette to WCAG AA.',                      'improvement',   'medium', date '2026-06-26', '',                                             'verified', 'hr'),

  -- EMP005 Alex Wilson — plenty claimed, little verified yet. His score should
  -- visibly jump when HR verifies, which is the demo beat for verification.
  ('EMP005', 'Alex Wilson', 'Ran the Q3 employer-brand campaign',             'Applications up 34% quarter on quarter.',               'delivery',      'high',   date '2026-08-19', '',                                             'claimed',  'self'),
  ('EMP005', 'Alex Wilson', 'Rewrote every job description',                  'All eighteen roles, consistent voice.',                 'improvement',   'medium', date '2026-08-05', '',                                             'claimed',  'self'),
  ('EMP005', 'Alex Wilson', 'Set up the referral tracking sheet',             'Manual, but it works.',                                 'support',       'low',    date '2026-07-24', '',                                             'claimed',  'self'),
  ('EMP005', 'Alex Wilson', 'Attended the marketing conference',              'No deliverable attached to this one.',                  'support',       'low',    date '2026-07-02', '',                                             'rejected', 'self'),

  -- EMP006 Lisa Chen — modest but real.
  ('EMP006', 'Lisa Chen',   'Closed the FY audit two weeks early',            'Zero findings.',                                        'delivery',      'high',   date '2026-08-14', '',                                             'verified', 'self'),
  ('EMP006', 'Lisa Chen',   'Automated the expense reconciliation',           'Was a four-hour manual job every Friday.',              'improvement',   'medium', date '2026-07-09', '',                                             'verified', 'self'),
  ('EMP006', 'Lisa Chen',   'Trained the team on the new expense policy',     'One session, whole company invited.',                   'mentoring',     'low',    date '2026-06-18', '',                                             'claimed',  'self')
) as v(employee_id, employee_name, title, detail, type, impact, occurred_on, link, status, source)
left join public.profiles p on p.employee_id = v.employee_id
where not exists (
  select 1 from public.contributions c
  where c.employee_id = v.employee_id and c.title = v.title
);
