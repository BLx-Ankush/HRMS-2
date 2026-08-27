// Central app-facing types (camelCase). DB rows are snake_case and mapped in hooks.

export type UserRole = "employee" | "admin";
export type EmployeeStatus = "active" | "inactive" | "on_leave";
export type AttendanceStatus =
  | "present" | "absent" | "late" | "half-day" | "leave" | "holiday" | "weekend";
export type LeaveStatus = "pending" | "approved" | "rejected";
export type PayrollStatus = "paid" | "pending" | "processing";

export interface User {
  id: string;            // profiles.id (UUID)
  email: string;
  name: string;
  role: UserRole;
  employeeId: string;
  department: string;
  position: string;
  phone?: string;
  address?: string;
  joinDate: string;
  about?: string;
  skills?: string[];
  avatar?: string;
}

export interface Employee {
  id: string;            // employee_id, e.g. "EMP001"
  name: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  status: EmployeeStatus;
  joinDate: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  appliedOn: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;                    // YYYY-MM-DD
  checkIn: string | null;          // HH:MM
  checkOut: string | null;
  workHours: string | null;
  extraHours: string | null;
  status: AttendanceStatus;
}

export interface TimeOffRequest {
  id: string;
  employeeId: string;
  name: string;                    // employee full name
  type: string;
  startDate: string;               // YYYY-MM-DD (format for display where needed)
  endDate: string;
  status: LeaveStatus;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  month: string;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  status: PayrollStatus;
  paidOn: string | null;
}

export interface SalaryComponent {
  name: string;
  amount: number;
  description: string;
  percentage?: string;
}

export interface EmployeeSalary {
  employeeId: string;
  basicSalary: number;
  hra: number;
  standardAllowance: number;
  performanceBonus: number;
  lta: number;
  fixedAllowance: number;
  pfEmployee: number;
  pfEmployer: number;
  professionalTax: number;
}

export interface CompanyStructure {
  monthWage: number;
  yearlyWage: number;
  workingDays: number;
  breakTime: number;
  components: SalaryComponent[];
  pfContribution: {
    employee: { amount: number; percentage: string };
    employer: { amount: number; percentage: string };
  };
  taxDeductions: { professionalTax: number };
}

export interface Activity {
  id: string;
  type: string;
  user: string;
  action: string;
  time: string;
}
