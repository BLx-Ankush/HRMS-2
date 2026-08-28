// Salary structure WebMCP tools — admin only.
//
// The split of responsibility here is the whole point. The agent reads intent
// out of a sentence ("put Ananya on 18 lakh", "give Rahul 12%"); every rupee is
// then derived by `salaryModel.ts`, drawn on the HR user's own Salary Structure
// page, and left there unsaved. `commit_salary_structure` accepts no amounts at
// all: it reads the proposal held in live page state, so the figure that reaches
// payroll is always the figure a human read on screen.
//
// That commit tool has no REST equivalent — the proposal it writes exists only
// in the browser tab the human is looking at, and no server can see it.
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { McpToolDescriptor } from "./types";
import { textResult, jsonResult } from "./registry";
import { requireApproval } from "./approval";
import { canvas } from "./canvas";
import {
  SALARY_MODEL_NOTES, SPLIT, STATUTORY,
  costOf, grossOf, netOf, proposeFromRaise, proposeFromTargetCtc, ratesFrom,
} from "./salaryModel";
import type { CompanyStructure, EmployeeSalary } from "@/types/db";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const n = (v: unknown, fallback = 0): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};
const invalidate = (qc: QueryClient, keys: string[][]) =>
  keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));

const obj = (
  properties: Record<string, unknown>,
  required: string[] = []
): Record<string, unknown> => ({ type: "object", properties, required, additionalProperties: false });

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

const inr = (v: number): string => `₹${Math.round(v || 0).toLocaleString("en-IN")}`;

// Same row → object mapping the app's own hooks use, kept local so these tools
// never depend on React state.
const toSalary = (r: any): EmployeeSalary => ({
  employeeId: r.employee_id,
  basicSalary: Number(r.basic_salary), hra: Number(r.hra),
  standardAllowance: Number(r.standard_allowance),
  performanceBonus: Number(r.performance_bonus),
  lta: Number(r.lta), fixedAllowance: Number(r.fixed_allowance),
  pfEmployee: Number(r.pf_employee), pfEmployer: Number(r.pf_employer),
  professionalTax: Number(r.professional_tax),
});

const toStructure = (r: any): CompanyStructure => ({
  monthWage: Number(r.month_wage), yearlyWage: Number(r.yearly_wage),
  workingDays: Number(r.working_days), breakTime: Number(r.break_time),
  components: (r.components ?? []) as CompanyStructure["components"],
  pfContribution: {
    employee: { amount: Number(r.pf_employee_amount), percentage: r.pf_employee_pct ?? "" },
    employer: { amount: Number(r.pf_employer_amount), percentage: r.pf_employer_pct ?? "" },
  },
  taxDeductions: { professionalTax: Number(r.professional_tax) },
});

async function loadStructure(): Promise<CompanyStructure | null> {
  const { data, error } = await supabase
    .from("company_salary_structure").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data ? toStructure(data) : null;
}

async function loadSalary(employeeId: string): Promise<EmployeeSalary | null> {
  const { data, error } = await supabase
    .from("employee_salaries").select("*").eq("employee_id", employeeId).maybeSingle();
  if (error) throw error;
  return data ? toSalary(data) : null;
}

async function loadProfile(
  employeeId: string
): Promise<{ id: string; name: string; department: string } | null> {
  const { data, error } = await supabase
    .from("profiles").select("id,name,department").eq("employee_id", employeeId).maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, name: data.name, department: data.department ?? "" } : null;
}

/** Admin-only: the published model, the proposal, and the on-screen commit. */
export function buildSalaryAdminTools(qc: QueryClient): McpToolDescriptor[] {
  return [
    {
      name: "get_salary_model",
      title: "Read the salary breakdown model",
      annotations: { readOnlyHint: true, idempotentHint: true },
      description:
        "Return the exact rules used to turn a CTC into a salary breakdown: the component split, the PF and professional-tax rates this company has configured, and what CTC is taken to mean. Call this before quoting or defending any component figure so you state the real policy instead of guessing at a market split.",
      inputSchema: obj({}),
      execute: async () => {
        const structure = await loadStructure();
        const rates = ratesFrom(structure);
        return jsonResult({
          split: {
            basic: "40% of monthly gross",
            hra: "50% of basic",
            standardAllowance: "10% of basic",
            performanceBonus: "10% of basic",
            lta: "8.33% of basic",
            fixedAllowance: "the balancing figure — gross less the five components above",
            rawRatios: SPLIT,
          },
          ratesInUse: {
            pfEmployeePct: rates.pfEmployeePct,
            pfEmployerPct: rates.pfEmployerPct,
            professionalTaxMonthly: rates.professionalTax,
            source: rates.usedDefaults
              ? "statutory defaults — no company salary structure is saved"
              : "company salary structure",
          },
          statutoryReference: STATUTORY,
          ctcMeaning: "monthly gross plus employer PF, × 12 for the annual figure",
          companyStructureOnFile: !!structure,
          notes: SALARY_MODEL_NOTES,
          intendedUse:
            "Explain and check figures with this. Salaries themselves are proposed with propose_salary_structure and only ever saved by a human.",
        });
      },
    },
    {
      name: "propose_salary_structure",
      title: "Draw a salary breakdown on the HR user's screen",
      annotations: { readOnlyHint: false, idempotentHint: true },
      description:
        "Work out a full salary breakdown for one employee — from a target CTC or a percentage raise — and render it on the HR user's Salary Structure page beside their current figures, with the arithmetic behind every line. Writes nothing and pays nobody. Pass intent only: never pass component amounts, they are derived here from the company's own configured PF and tax so the numbers can be audited. Call this before commit_salary_structure, which can only save a breakdown that is already on screen.",
      inputSchema: obj(
        {
          employeeId: str("Employee whose salary to work out, e.g. 'EMP007'."),
          targetAnnualCtc: num("Target cost to company per year, in rupees, e.g. 1800000 for 18 lakh."),
          targetMonthlyCtc: num("Target cost to company per month, if the human spoke in monthly terms."),
          raisePercent: num(
            "Percentage change on the structure already saved, e.g. 12 for a 12% raise or -5 for a cut. Keeps any component HR set by hand in shape. Requires an existing salary record."
          ),
        },
        ["employeeId"]
      ),
      execute: async (args) => {
        const employeeId = s(args.employeeId).toUpperCase();
        if (!employeeId) return { ...textResult("employeeId is required."), isError: true };

        const annual = n(args.targetAnnualCtc, 0);
        const monthly = n(args.targetMonthlyCtc, 0);
        const raise = n(args.raisePercent, 0);
        const bases = [annual > 0, monthly > 0, raise !== 0].filter(Boolean).length;
        if (bases === 0)
          return {
            ...textResult(
              "Give exactly one basis: targetAnnualCtc, targetMonthlyCtc, or raisePercent. " +
              "Ask the HR user which they meant rather than assuming a figure."
            ),
            isError: true,
          };
        if (bases > 1)
          return {
            ...textResult("Only one basis at a time — a target CTC or a raise percentage, not both."),
            isError: true,
          };

        const profile = await loadProfile(employeeId);
        if (!profile)
          return {
            ...textResult(`No employee ${employeeId} on the roster, so there is nobody to pay.`),
            isError: true,
          };
        const [current, structure] = await Promise.all([loadSalary(employeeId), loadStructure()]);
        if (raise !== 0 && !current)
          return {
            ...textResult(
              `${profile.name} (${employeeId}) has no salary structure on file, so there is nothing to ` +
              `apply ${raise}% to. Propose a target CTC instead — ask the HR user for the figure.`
            ),
            isError: true,
          };

        const proposal =
          raise !== 0
            ? proposeFromRaise({ employeeId, current: current!, structure, raisePct: raise })
            : proposeFromTargetCtc({
                employeeId, current, structure,
                ...(annual > 0 ? { annualCtc: annual } : { monthlyCtc: monthly }),
              });

        const currentGross = current ? grossOf(current) : 0;
        const currentNet = current ? netOf(current) : 0;
        canvas.showSalaryProposal({
          employeeId,
          employeeName: profile.name,
          basis: proposal.basis,
          monthlyCtc: proposal.monthlyCtc,
          lines: proposal.lines,
          currentGross,
          proposedGross: grossOf(proposal.salary),
          currentNet,
          proposedNet: netOf(proposal.salary),
          employerCost: costOf(proposal.salary),
          note: proposal.note,
          warnings: proposal.warnings,
        });

        return jsonResult({
          drawnOnScreen: true,
          savedToDatabase: false,
          employeeId,
          employeeName: profile.name,
          department: profile.department,
          basis: proposal.basis,
          hadExistingStructure: !!current,
          monthly: {
            currentGross, proposedGross: grossOf(proposal.salary),
            currentNet, proposedNet: netOf(proposal.salary),
            costToCompany: costOf(proposal.salary),
          },
          annualCostToCompany: costOf(proposal.salary) * 12,
          lines: proposal.lines,
          ratesUsed: {
            pfEmployeePct: proposal.rates.pfEmployeePct,
            pfEmployerPct: proposal.rates.pfEmployerPct,
            professionalTaxMonthly: proposal.rates.professionalTax,
            source: proposal.rates.usedDefaults ? "statutory defaults" : "company structure",
          },
          warnings: proposal.warnings,
          modelNotes: SALARY_MODEL_NOTES,
          nextStep:
            "The breakdown is on the HR user's Salary Structure page, unsaved. Walk them through it — " +
            "read out any warnings — then call commit_salary_structure only if they ask you to save it. " +
            "If they want a different figure, call this tool again; the panel is replaced, not stacked.",
        });
      },
    },
    {
      name: "commit_salary_structure",
      title: "Save the salary breakdown currently on screen",
      annotations: { readOnlyHint: false, idempotentHint: false },
      description:
        "Save the salary breakdown the HR user is looking at right now. It takes no amounts as arguments — it reads the proposal held in this page's live state, so it can only ever write a figure the human has already seen on their own screen. Requires in-page confirmation, which shows every component old against new. Call propose_salary_structure first; there is nothing to save until a breakdown is displayed.",
      inputSchema: obj({
        reason: str("One line for the record, e.g. 'promotion to Senior Engineer'."),
        decidedBy: str("Name to record as the approver. Defaults to the signed-in HR user."),
      }),
      execute: async (args) => {
        const proposal = canvas.getSnapshot().salaryProposal;
        if (!proposal)
          return {
            ...textResult(
              "No salary breakdown is on screen, so there is nothing to save. Call " +
              "propose_salary_structure first so the human can see what they would be approving."
            ),
            isError: true,
          };

        // Rebuild the row from the displayed lines, not from any argument, so
        // what is written is exactly what was rendered.
        const salary: EmployeeSalary = { employeeId: proposal.employeeId } as EmployeeSalary;
        proposal.lines.forEach((l) => {
          (salary as any)[l.field] = Math.round(l.proposed || 0);
        });
        if (!grossOf(salary))
          return {
            ...textResult("The displayed breakdown adds up to zero gross — nothing worth saving."),
            isError: true,
          };

        const changed = proposal.lines.filter(
          (l) => Math.round(l.current || 0) !== Math.round(l.proposed || 0)
        );
        const details: Record<string, string> = {
          Employee: `${proposal.employeeName} (${proposal.employeeId})`,
          Basis: proposal.basis,
          "Monthly gross": `${inr(proposal.currentGross)} → ${inr(proposal.proposedGross)}`,
          "Monthly take-home": `${inr(proposal.currentNet)} → ${inr(proposal.proposedNet)}`,
          "Cost to company": `${inr(proposal.employerCost)}/month · ${inr(proposal.employerCost * 12)}/year`,
        };
        (changed.length ? changed : proposal.lines).forEach((l) => {
          details[l.label] = `${inr(l.current)} → ${inr(l.proposed)}${l.math ? ` (${l.math})` : ""}`;
        });
        if (proposal.warnings.length) details["Check first"] = proposal.warnings.join(" · ");
        details["Effect"] =
          "replaces this employee's saved structure. Payroll already generated for this month must be " +
          "regenerated before it reflects the new figures.";

        const isCut = proposal.currentGross > 0 && proposal.proposedGross < proposal.currentGross;
        const ok = await requireApproval({
          title: proposal.currentGross ? "Save revised salary structure" : "Save salary structure",
          summary: `${proposal.employeeName}: ${inr(proposal.proposedGross)} gross a month (${proposal.basis})`,
          details,
          confirmLabel: "Save structure",
          destructive: isCut,
        });
        if (!ok)
          return textResult(
            "Cancelled — nothing was saved and the breakdown is still on screen for editing."
          );

        const { error } = await supabase.from("employee_salaries").upsert(
          {
            employee_id: salary.employeeId, basic_salary: salary.basicSalary, hra: salary.hra,
            standard_allowance: salary.standardAllowance, performance_bonus: salary.performanceBonus,
            lta: salary.lta, fixed_allowance: salary.fixedAllowance, pf_employee: salary.pfEmployee,
            pf_employer: salary.pfEmployer, professional_tax: salary.professionalTax,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "employee_id" }
        );
        if (error) return { ...textResult(error.message), isError: true };

        const decidedBy = s(args.decidedBy) || "HR";
        const reason = s(args.reason) || proposal.basis;
        await supabase.from("activities").insert({
          type: "salary", actor_name: decidedBy,
          action: `saved a salary structure for ${proposal.employeeName} (${inr(proposal.proposedGross)}/month gross — ${reason})`,
        });
        invalidate(qc, [["employee_salaries"], ["activities"], ["stats"]]);
        canvas.clearSalaryProposal();
        return textResult(
          `Saved ${proposal.employeeName}'s structure exactly as displayed: ${inr(proposal.proposedGross)} gross ` +
          `a month, ${inr(proposal.proposedNet)} take-home, ${inr(proposal.employerCost * 12)} a year cost to company. ` +
          `The proposal panel has cleared and the saved figures now show on the page. Regenerate payroll if this ` +
          `month's run already happened.`
        );
      },
    },
  ];
}
