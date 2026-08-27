import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabaseClient";
import type {
  Employee, LeaveRequest, AttendanceRecord, TimeOffRequest, PayrollRecord,
  EmployeeSalary, CompanyStructure, Activity, LeaveStatus,
  Contribution, ContributionStatus, ContributionType, ContributionSource, BonusAward,
} from "@/types/db";

// ---------- row -> app type mappers ----------
const toEmployee = (r: any): Employee => ({
  id: r.employee_id, name: r.name, email: r.email, phone: r.phone ?? "",
  department: r.department, position: r.position, status: r.status, joinDate: r.join_date,
});
const toLeave = (r: any): LeaveRequest => ({
  id: r.id, employeeId: r.employee_id, employeeName: r.employee_name, type: r.type,
  startDate: r.start_date, endDate: r.end_date, days: r.days, reason: r.reason,
  status: r.status, appliedOn: r.applied_on,
});
const toAttendance = (r: any): AttendanceRecord => ({
  id: r.id, employeeId: r.employee_id, employeeName: r.employee_name, department: r.department ?? "",
  date: r.date, checkIn: r.check_in, checkOut: r.check_out,
  workHours: r.work_hours, extraHours: r.extra_hours, status: r.status,
});
const toTimeOff = (r: any): TimeOffRequest => ({
  id: r.id, employeeId: r.employee_id, name: r.employee_name, type: r.type,
  startDate: r.start_date, endDate: r.end_date, status: r.status,
});
const toPayroll = (r: any): PayrollRecord => ({
  id: r.id, employeeId: r.employee_id, employeeName: r.employee_name, department: r.department ?? "",
  month: r.month, basicSalary: Number(r.basic_salary), allowances: Number(r.allowances),
  deductions: Number(r.deductions), netSalary: Number(r.net_salary), status: r.status, paidOn: r.paid_on,
});
const toEmployeeSalary = (r: any): EmployeeSalary => ({
  employeeId: r.employee_id, basicSalary: Number(r.basic_salary), hra: Number(r.hra),
  standardAllowance: Number(r.standard_allowance), performanceBonus: Number(r.performance_bonus),
  lta: Number(r.lta), fixedAllowance: Number(r.fixed_allowance),
  pfEmployee: Number(r.pf_employee), pfEmployer: Number(r.pf_employer),
  professionalTax: Number(r.professional_tax),
});
const toCompanyStructure = (r: any): CompanyStructure => ({
  monthWage: Number(r.month_wage), yearlyWage: Number(r.yearly_wage),
  workingDays: Number(r.working_days), breakTime: Number(r.break_time),
  components: (r.components ?? []) as CompanyStructure["components"],
  pfContribution: {
    employee: { amount: Number(r.pf_employee_amount), percentage: r.pf_employee_pct ?? "" },
    employer: { amount: Number(r.pf_employer_amount), percentage: r.pf_employer_pct ?? "" },
  },
  taxDeductions: { professionalTax: Number(r.professional_tax) },
});
const toContribution = (r: any): Contribution => ({
  id: r.id, employeeId: r.employee_id, employeeName: r.employee_name, department: r.department ?? "",
  title: r.title, detail: r.detail ?? "", type: r.type, impact: r.impact,
  occurredOn: r.occurred_on, link: r.link ?? "", status: r.status,
  verifiedBy: r.verified_by ?? "", verifiedAt: r.verified_at ?? undefined, source: r.source ?? "self",
});
const toBonusAward = (r: any): BonusAward => ({
  id: r.id, employeeId: r.employee_id, employeeName: r.employee_name, period: r.period,
  amount: Number(r.amount), score: Number(r.score), rank: r.rank ?? undefined,
  kind: r.kind, reason: r.reason ?? "", decidedBy: r.decided_by ?? "", createdAt: r.created_at,
});

async function logActivity(type: string, actorName: string, action: string) {
  await supabase.from("activities").insert({ type, actor_name: actorName, action });
}

function currentMonthLabel(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ---------- Employees (from profiles) ----------
export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async (): Promise<Employee[]> => {
      const { data, error } = await supabase.from("profiles").select("*").order("employee_id");
      if (error) throw error;
      return (data ?? []).map(toEmployee);
    },
  });
}

export interface NewEmployeeInput {
  employeeId: string; name: string; email: string; phone?: string;
  department: string; position: string; status: Employee["status"]; joinDate: string;
}
export function useAddEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: NewEmployeeInput) => {
      const { error } = await supabase.from("profiles").insert({
        employee_id: i.employeeId, name: i.name, email: i.email, phone: i.phone ?? "",
        department: i.department, position: i.position, status: i.status,
        join_date: i.joinDate, role: "employee",
      });
      if (error) throw error;
      await logActivity("welcome", i.name, "joined the team");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

// ---------- Leave requests ----------
export function useLeaveRequests() {
  return useQuery({
    queryKey: ["leave_requests"],
    queryFn: async (): Promise<LeaveRequest[]> => {
      const { data, error } = await supabase
        .from("leave_requests").select("*").order("applied_on", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toLeave);
    },
  });
}

export interface NewLeaveInput {
  profileId: string; employeeId: string; employeeName: string;
  type: string; startDate: string; endDate: string; days: number; reason: string;
}
export function useSubmitLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: NewLeaveInput) => {
      const { error } = await supabase.from("leave_requests").insert({
        profile_id: i.profileId, employee_id: i.employeeId, employee_name: i.employeeName,
        type: i.type, start_date: i.startDate, end_date: i.endDate, days: i.days,
        reason: i.reason, status: "pending",
      });
      if (error) throw error;
      await logActivity("leave", i.employeeName, `requested ${i.type.toLowerCase()}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave_requests"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useDecideLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeaveStatus }) => {
      const { error } = await supabase.from("leave_requests").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave_requests"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

// ---------- Attendance ----------
export function useAttendance() {
  return useQuery({
    queryKey: ["attendance"],
    queryFn: async (): Promise<AttendanceRecord[]> => {
      const { data, error } = await supabase
        .from("attendance").select("*").order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toAttendance);
    },
  });
}

export function useTodayAttendance(employeeId?: string) {
  return useQuery({
    queryKey: ["attendance_today", employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<AttendanceRecord | null> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("attendance").select("*")
        .eq("employee_id", employeeId!).eq("date", today).maybeSingle();
      if (error) throw error;
      return data ? toAttendance(data) : null;
    },
  });
}

export interface CheckInput {
  profileId: string; employeeId: string; employeeName: string; department?: string;
  date: string; checkIn?: string | null; checkOut?: string | null;
  workHours?: string | null; extraHours?: string | null;
  status: AttendanceRecord["status"]; activity?: string;
}
export function useUpsertAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: CheckInput) => {
      const { error } = await supabase.from("attendance").upsert({
        profile_id: i.profileId, employee_id: i.employeeId, employee_name: i.employeeName,
        department: i.department ?? "", date: i.date,
        check_in: i.checkIn ?? null, check_out: i.checkOut ?? null,
        work_hours: i.workHours ?? null, extra_hours: i.extraHours ?? null, status: i.status,
      }, { onConflict: "employee_id,date" });
      if (error) throw error;
      if (i.activity) await logActivity("attendance", i.employeeName, i.activity);
    },
    onSuccess: (_d, i) => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["attendance_today", i.employeeId] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

// ---------- Time-off requests ----------
export function useTimeOffRequests() {
  return useQuery({
    queryKey: ["time_off"],
    queryFn: async (): Promise<TimeOffRequest[]> => {
      const { data, error } = await supabase
        .from("time_off_requests").select("*").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toTimeOff);
    },
  });
}

export interface NewTimeOffInput {
  profileId: string; employeeId: string; employeeName: string;
  type: string; startDate: string; endDate: string;
}
export function useSubmitTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: NewTimeOffInput) => {
      const { error } = await supabase.from("time_off_requests").insert({
        profile_id: i.profileId, employee_id: i.employeeId, employee_name: i.employeeName,
        type: i.type, start_date: i.startDate, end_date: i.endDate, status: "pending",
      });
      if (error) throw error;
      await logActivity("time_off", i.employeeName, `requested ${i.type.toLowerCase()}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["time_off"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export function useDecideTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeaveStatus }) => {
      const { error } = await supabase.from("time_off_requests").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["time_off"] }),
  });
}

// ---------- Payroll ----------
export function usePayroll() {
  return useQuery({
    queryKey: ["payroll"],
    queryFn: async (): Promise<PayrollRecord[]> => {
      const { data, error } = await supabase
        .from("payroll").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toPayroll);
    },
  });
}

// Generate the current month's payroll for every employee, derived from their
// salary structure (falls back to zeros where no structure exists). Re-runnable:
// clears any existing rows for the month first, then inserts fresh ones.
export function useGeneratePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const month = currentMonthLabel();
      const [{ data: profs, error: e1 }, { data: sals, error: e2 }] = await Promise.all([
        supabase.from("profiles").select("id,employee_id,name,department"),
        supabase.from("employee_salaries").select("*"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const salByEmp: Record<string, any> = {};
      (sals ?? []).forEach((s: any) => { salByEmp[s.employee_id] = s; });
      const rows = (profs ?? []).map((p: any) => {
        const s = salByEmp[p.employee_id];
        const basic = Number(s?.basic_salary ?? 0);
        const allowances = s
          ? Number(s.hra) + Number(s.standard_allowance) + Number(s.performance_bonus) +
            Number(s.lta) + Number(s.fixed_allowance)
          : 0;
        const deductions = s ? Number(s.pf_employee) + Number(s.professional_tax) : 0;
        return {
          profile_id: p.id, employee_id: p.employee_id, employee_name: p.name,
          department: p.department, month, basic_salary: basic, allowances, deductions,
          net_salary: basic + allowances - deductions, status: "pending", paid_on: null,
        };
      });
      const { error: delErr } = await supabase.from("payroll").delete().eq("month", month);
      if (delErr) throw delErr;
      if (rows.length) {
        const { error } = await supabase.from("payroll").insert(rows);
        if (error) throw error;
      }
      await logActivity("payroll", "System", `generated payroll for ${month}`);
      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

// ---------- Salary structure ----------
export function useEmployeeSalaries() {
  return useQuery({
    queryKey: ["employee_salaries"],
    queryFn: async (): Promise<Record<string, EmployeeSalary>> => {
      const { data, error } = await supabase.from("employee_salaries").select("*");
      if (error) throw error;
      const map: Record<string, EmployeeSalary> = {};
      (data ?? []).forEach((r: any) => { map[r.employee_id] = toEmployeeSalary(r); });
      return map;
    },
  });
}

export function useUpsertEmployeeSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: EmployeeSalary) => {
      const { error } = await supabase.from("employee_salaries").upsert({
        employee_id: s.employeeId, basic_salary: s.basicSalary, hra: s.hra,
        standard_allowance: s.standardAllowance, performance_bonus: s.performanceBonus,
        lta: s.lta, fixed_allowance: s.fixedAllowance, pf_employee: s.pfEmployee,
        pf_employer: s.pfEmployer, professional_tax: s.professionalTax, updated_at: new Date().toISOString(),
      }, { onConflict: "employee_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee_salaries"] }),
  });
}

export function useCompanyStructure() {
  return useQuery({
    queryKey: ["company_structure"],
    queryFn: async (): Promise<CompanyStructure | null> => {
      const { data, error } = await supabase
        .from("company_salary_structure").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data ? toCompanyStructure(data) : null;
    },
  });
}

export function useUpdateCompanyStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: CompanyStructure) => {
      const { error } = await supabase.from("company_salary_structure").upsert({
        id: 1, month_wage: c.monthWage, yearly_wage: c.yearlyWage,
        working_days: c.workingDays, break_time: c.breakTime, components: c.components,
        pf_employee_amount: c.pfContribution.employee.amount, pf_employee_pct: c.pfContribution.employee.percentage,
        pf_employer_amount: c.pfContribution.employer.amount, pf_employer_pct: c.pfContribution.employer.percentage,
        professional_tax: c.taxDeductions.professionalTax, updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company_structure"] }),
  });
}

// ---------- Activities ----------
export function useActivities() {
  return useQuery({
    queryKey: ["activities"],
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase
        .from("activities").select("*").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id, type: r.type, user: r.actor_name, action: r.action,
        time: formatDistanceToNow(new Date(r.created_at), { addSuffix: true }),
      }));
    },
  });
}

// ---------- Dashboard stats ----------
export interface AdminStats {
  totalEmployees: number; presentToday: number; attendanceRate: number;
  pendingLeaveRequests: number; totalPayroll: number;
}
export function useAdminStats() {
  return useQuery({
    queryKey: ["stats", "admin"],
    queryFn: async (): Promise<AdminStats> => {
      const today = new Date().toISOString().slice(0, 10);
      const [emp, present, pending, pay] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("attendance").select("id", { count: "exact", head: true })
          .eq("date", today).in("status", ["present", "late"]),
        supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("payroll").select("net_salary").eq("month", currentMonthLabel()),
      ]);
      const totalEmployees = emp.count ?? 0;
      const presentToday = present.count ?? 0;
      const totalPayroll = (pay.data ?? []).reduce((s: number, r: any) => s + Number(r.net_salary), 0);
      return {
        totalEmployees, presentToday,
        attendanceRate: totalEmployees ? Math.round((presentToday / totalEmployees) * 100) : 0,
        pendingLeaveRequests: pending.count ?? 0, totalPayroll,
      };
    },
  });
}

export interface EmployeeStats {
  attendanceRate: number; leaveBalance: number; pendingRequests: number; nextPayday: string;
}
const PAID_LEAVE_QUOTA = 12;
export function useEmployeeStats(employeeId?: string) {
  return useQuery({
    queryKey: ["stats", "employee", employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<EmployeeStats> => {
      const [att, leave, pay] = await Promise.all([
        supabase.from("attendance").select("status").eq("employee_id", employeeId!),
        supabase.from("leave_requests").select("type,days,status").eq("employee_id", employeeId!),
        supabase.from("payroll").select("month,status").eq("employee_id", employeeId!).eq("status", "pending"),
      ]);
      const attRows = att.data ?? [];
      const worked = attRows.filter((r: any) => r.status === "present" || r.status === "late").length;
      const countable = attRows.filter((r: any) => r.status !== "weekend" && r.status !== "holiday").length;
      const usedPaid = (leave.data ?? [])
        .filter((r: any) => r.status === "approved" && r.type === "Paid Leave")
        .reduce((s: number, r: any) => s + Number(r.days), 0);
      const pendingRequests = (leave.data ?? []).filter((r: any) => r.status === "pending").length;
      return {
        attendanceRate: countable ? Math.round((worked / countable) * 100) : 0,
        leaveBalance: Math.max(0, PAID_LEAVE_QUOTA - usedPaid),
        pendingRequests,
        nextPayday: (pay.data ?? [])[0]?.month ?? currentMonthLabel(),
      };
    },
  });
}

// ---------- Contributions (bonus evidence) ----------
// Read is intentionally open to every signed-in user: the basis for a bonus is
// not a secret. Verification is admin-only, enforced by RLS as well as the UI.
export function useContributions() {
  return useQuery({
    queryKey: ["contributions"],
    queryFn: async (): Promise<Contribution[]> => {
      const { data, error } = await supabase
        .from("contributions").select("*").order("occurred_on", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toContribution);
    },
  });
}

export interface NewContributionInput {
  profileId?: string | null;
  employeeId: string;
  employeeName: string;
  department?: string;
  title: string;
  detail?: string;
  type: ContributionType;
  impact: "low" | "medium" | "high";
  occurredOn: string;
  link?: string;
  source?: ContributionSource;
  /** HR-entered rows may be verified on the way in; self-logged rows never are. */
  status?: ContributionStatus;
  verifiedBy?: string;
}

/** Insert one or many contribution rows. Import approval uses the array form. */
export function useLogContributions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewContributionInput | NewContributionInput[]) => {
      const list = Array.isArray(input) ? input : [input];
      if (!list.length) return 0;
      const rows = list.map((i) => ({
        profile_id: i.profileId ?? null,
        employee_id: i.employeeId, employee_name: i.employeeName,
        department: i.department ?? "", title: i.title, detail: i.detail ?? "",
        type: i.type, impact: i.impact, occurred_on: i.occurredOn, link: i.link ?? "",
        status: i.status ?? "claimed",
        verified_by: i.status === "verified" ? (i.verifiedBy ?? "") : "",
        verified_at: i.status === "verified" ? new Date().toISOString() : null,
        source: i.source ?? "self",
      }));
      const { error } = await supabase.from("contributions").insert(rows);
      if (error) throw error;
      await logActivity(
        "contribution",
        list.length === 1 ? list[0].employeeName : "HR",
        list.length === 1 ? "logged a contribution" : `imported ${list.length} contributions`
      );
      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contributions"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

/** HR verifies or rejects a claim. This is the step that makes points count. */
export function useVerifyContribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { id, status, verifiedBy }: { id: string; status: ContributionStatus; verifiedBy: string }
    ) => {
      const { error } = await supabase.from("contributions").update({
        status,
        verified_by: verifiedBy,
        verified_at: status === "claimed" ? null : new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contributions"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

// ---------- Bonus awards (the recorded human decision) ----------
export function useBonusAwards() {
  return useQuery({
    queryKey: ["bonus_awards"],
    queryFn: async (): Promise<BonusAward[]> => {
      const { data, error } = await supabase
        .from("bonus_awards").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toBonusAward);
    },
  });
}

export interface NewBonusAwardInput {
  profileId?: string | null;
  employeeId: string; employeeName: string; period: string;
  amount: number; score: number; rank?: number;
  kind: "bonus" | "award"; reason: string; decidedBy: string;
}

/**
 * Record a bonus/award decision. Upserts on (employee_id, period, kind) so
 * re-running an allocation for the same window corrects the earlier figure
 * instead of stacking a second payment on top of it.
 */
export function useSaveBonusAwards() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewBonusAwardInput | NewBonusAwardInput[]) => {
      const list = Array.isArray(input) ? input : [input];
      if (!list.length) return 0;
      // Fill in the profile UUID for any caller that only knows the employee ID.
      // Without it, `bonus_read`'s owns_profile(profile_id) check hides the row
      // from the person it was awarded to.
      const needLookup = list.filter((i) => !i.profileId).map((i) => i.employeeId);
      const profileByEmp = new Map<string, string>();
      if (needLookup.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id,employee_id").in("employee_id", needLookup);
        (profs ?? []).forEach((p: any) => profileByEmp.set(p.employee_id, p.id));
      }
      const rows = list.map((i) => ({
        profile_id: i.profileId ?? profileByEmp.get(i.employeeId) ?? null,
        employee_id: i.employeeId, employee_name: i.employeeName, period: i.period,
        amount: i.amount, score: i.score, rank: i.rank ?? null,
        kind: i.kind, reason: i.reason, decided_by: i.decidedBy,
      }));
      const { error } = await supabase
        .from("bonus_awards").upsert(rows, { onConflict: "employee_id,period,kind" });
      if (error) throw error;
      await logActivity("bonus", list[0].decidedBy || "HR",
        list.length === 1
          ? `recorded a ${list[0].kind} for ${list[0].employeeName}`
          : `recorded ${list.length} ${list[0].kind === "award" ? "awards" : "bonuses"} for ${list[0].period}`);
      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bonus_awards"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}
