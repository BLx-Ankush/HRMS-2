// Deterministic salary breakdown — the part an LLM must not improvise.
//
// An agent is good at reading "put Ananya on 18 lakh from September" and bad at
// arithmetic nobody can audit. So the agent supplies intent only: a target CTC
// or a percentage raise. Every rupee below is derived here, from published
// splits plus the company's own configured PF and professional tax, and every
// line carries the arithmetic that produced it.
//
// Nothing in this file touches the network or the database. It returns a
// proposal; `commit_salary_structure` is the only thing that can save one, and
// it saves what is drawn on screen rather than anything an agent passes in.
import type { SalaryProposalLine } from "./canvas";
import type { CompanyStructure, EmployeeSalary } from "@/types/db";

/**
 * Published split, as a share of monthly GROSS pay. Basic drives the statutory
 * components, so it is the only one expressed against gross; the rest hang off
 * basic the way Indian payroll normally does. `fixedAllowance` is deliberately
 * absent: it is the balancing figure, so the components always add up exactly.
 */
export const SPLIT = {
  basicOfGross: 0.4,
  hraOfBasic: 0.5,
  ltaOfBasic: 0.0833,
  performanceOfBasic: 0.1,
  standardOfBasic: 0.1,
} as const;

/** Statutory defaults used only when the company structure has not set them. */
export const STATUTORY = {
  pfPct: 0.12,
  /** EPF wage ceiling. Above this, 12% of basic is a choice, not a requirement. */
  pfCeilingWage: 15000,
  professionalTaxMonthly: 200,
} as const;

export const SALARY_MODEL_NOTES: string[] = [
  "Basic is 40% of monthly gross; HRA is 50% of basic; LTA 8.33%, performance 10% and standard allowance 10% of basic.",
  "Fixed allowance is the balancing figure, so the six earnings always sum to gross exactly.",
  "PF is taken from the company salary structure when it sets a percentage, otherwise 12% of basic.",
  "Professional tax comes from the company structure, otherwise ₹200 a month.",
  "CTC means gross plus employer PF, so a target CTC is divided by (1 + employer PF rate on basic) before splitting.",
  "A raise scales the structure HR already saved rather than re-deriving it, so any hand-set component keeps its shape.",
];

const round = (n: number): number => Math.round(n || 0);

const inr = (n: number): string => `₹${round(n).toLocaleString("en-IN")}`;

/** Read "12%" / "12" / "" out of the company structure's percentage field. */
function pctFrom(raw: string | undefined, fallback: number): number {
  const m = String(raw ?? "").match(/(\d+(?:\.\d+)?)/);
  if (!m) return fallback;
  const v = Number(m[1]);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return v > 1 ? v / 100 : v;
}

export interface SalaryRates {
  pfEmployeePct: number;
  pfEmployerPct: number;
  professionalTax: number;
  /** True when we fell back to statutory defaults instead of company config. */
  usedDefaults: boolean;
}

/** Resolve the rates to apply, preferring what the company has configured. */
export function ratesFrom(structure: CompanyStructure | null | undefined): SalaryRates {
  if (!structure) {
    return {
      pfEmployeePct: STATUTORY.pfPct,
      pfEmployerPct: STATUTORY.pfPct,
      professionalTax: STATUTORY.professionalTaxMonthly,
      usedDefaults: true,
    };
  }
  return {
    pfEmployeePct: pctFrom(structure.pfContribution?.employee?.percentage, STATUTORY.pfPct),
    pfEmployerPct: pctFrom(structure.pfContribution?.employer?.percentage, STATUTORY.pfPct),
    professionalTax: structure.taxDeductions?.professionalTax || STATUTORY.professionalTaxMonthly,
    usedDefaults: false,
  };
}

export const EMPTY_SALARY = (employeeId: string): EmployeeSalary => ({
  employeeId,
  basicSalary: 0,
  hra: 0,
  standardAllowance: 0,
  performanceBonus: 0,
  lta: 0,
  fixedAllowance: 0,
  pfEmployee: 0,
  pfEmployer: 0,
  professionalTax: 0,
});

export const grossOf = (s: EmployeeSalary): number =>
  s.basicSalary + s.hra + s.standardAllowance + s.performanceBonus + s.lta + s.fixedAllowance;

export const netOf = (s: EmployeeSalary): number =>
  grossOf(s) - s.pfEmployee - s.professionalTax;

/** Gross plus employer PF — what the company actually spends per month. */
export const costOf = (s: EmployeeSalary): number => grossOf(s) + s.pfEmployer;

// ------------------------------------------------------------------ derivation

/** Field order is the order the panel renders, so it reads like a payslip. */
const FIELDS: { field: keyof EmployeeSalary; label: string; kind: SalaryProposalLine["kind"] }[] = [
  { field: "basicSalary", label: "Basic", kind: "earning" },
  { field: "hra", label: "HRA", kind: "earning" },
  { field: "standardAllowance", label: "Standard allowance", kind: "earning" },
  { field: "performanceBonus", label: "Performance bonus", kind: "earning" },
  { field: "lta", label: "LTA", kind: "earning" },
  { field: "fixedAllowance", label: "Fixed allowance", kind: "earning" },
  { field: "pfEmployee", label: "PF (employee)", kind: "deduction" },
  { field: "professionalTax", label: "Professional tax", kind: "deduction" },
  { field: "pfEmployer", label: "PF (employer)", kind: "employer" },
];

/**
 * Split a monthly gross into components. Every earning is rounded to whole
 * rupees and `fixedAllowance` takes the residue, so the six earnings sum to
 * `gross` exactly rather than to gross ± a rounding error.
 */
export function splitGross(
  employeeId: string,
  gross: number,
  rates: SalaryRates
): EmployeeSalary {
  const g = Math.max(0, round(gross));
  const basicSalary = round(g * SPLIT.basicOfGross);
  const hra = round(basicSalary * SPLIT.hraOfBasic);
  const standardAllowance = round(basicSalary * SPLIT.standardOfBasic);
  const performanceBonus = round(basicSalary * SPLIT.performanceOfBasic);
  const lta = round(basicSalary * SPLIT.ltaOfBasic);
  const fixedAllowance = g - (basicSalary + hra + standardAllowance + performanceBonus + lta);
  return {
    employeeId,
    basicSalary,
    hra,
    standardAllowance,
    performanceBonus,
    lta,
    fixedAllowance,
    pfEmployee: round(basicSalary * rates.pfEmployeePct),
    pfEmployer: round(basicSalary * rates.pfEmployerPct),
    professionalTax: round(rates.professionalTax),
  };
}

/** Scale a saved structure by a factor, keeping whatever shape HR gave it. */
function scaleSalary(current: EmployeeSalary, factor: number, rates: SalaryRates): EmployeeSalary {
  const targetGross = round(grossOf(current) * factor);
  const basicSalary = round(current.basicSalary * factor);
  const hra = round(current.hra * factor);
  const standardAllowance = round(current.standardAllowance * factor);
  const performanceBonus = round(current.performanceBonus * factor);
  const lta = round(current.lta * factor);
  const fixedAllowance =
    targetGross - (basicSalary + hra + standardAllowance + performanceBonus + lta);
  return {
    employeeId: current.employeeId,
    basicSalary,
    hra,
    standardAllowance,
    performanceBonus,
    lta,
    fixedAllowance,
    pfEmployee: round(basicSalary * rates.pfEmployeePct),
    pfEmployer: round(basicSalary * rates.pfEmployerPct),
    professionalTax: round(rates.professionalTax),
  };
}

// ------------------------------------------------------------------- proposals

export interface SalaryProposal {
  salary: EmployeeSalary;
  lines: SalaryProposalLine[];
  /** Plain-language basis, echoed on the panel and in the approval dialog. */
  basis: string;
  monthlyCtc: number;
  note: string;
  warnings: string[];
  rates: SalaryRates;
}

/** Per-line arithmetic, so every figure on screen can be checked by hand. */
function mathStrings(
  proposed: EmployeeSalary,
  rates: SalaryRates,
  gross: number,
  scaleFrom?: { current: EmployeeSalary; factor: number }
): Record<string, string> {
  const basic = inr(proposed.basicSalary);
  const pfSource = rates.usedDefaults ? "statutory default" : "company structure";
  const f = scaleFrom ? scaleFrom.factor.toFixed(4) : "";
  const earnings: Record<string, string> = scaleFrom
    ? {
        basicSalary: `${inr(scaleFrom.current.basicSalary)} × ${f}`,
        hra: `${inr(scaleFrom.current.hra)} × ${f}`,
        standardAllowance: `${inr(scaleFrom.current.standardAllowance)} × ${f}`,
        performanceBonus: `${inr(scaleFrom.current.performanceBonus)} × ${f}`,
        lta: `${inr(scaleFrom.current.lta)} × ${f}`,
        fixedAllowance: `target gross ${inr(gross)} less the five lines above`,
      }
    : {
        basicSalary: `40% of ${inr(gross)} monthly gross`,
        hra: `50% of basic ${basic}`,
        standardAllowance: `10% of basic ${basic}`,
        performanceBonus: `10% of basic ${basic}`,
        lta: `8.33% of basic ${basic}`,
        fixedAllowance: `gross ${inr(gross)} less the five lines above`,
      };
  return {
    ...earnings,
    pfEmployee: `${(rates.pfEmployeePct * 100).toFixed(2)}% of basic ${basic} (${pfSource})`,
    professionalTax: `flat ${inr(rates.professionalTax)}/month (${pfSource})`,
    pfEmployer: `${(rates.pfEmployerPct * 100).toFixed(2)}% of basic ${basic} — employer cost, not deducted`,
  };
}

function linesFor(
  current: EmployeeSalary,
  proposed: EmployeeSalary,
  math: Record<string, string>
): SalaryProposalLine[] {
  return FIELDS.map(({ field, label, kind }) => ({
    field: String(field),
    label,
    current: Number(current[field] ?? 0),
    proposed: Number(proposed[field] ?? 0),
    math: math[String(field)] ?? "",
    kind,
  }));
}

/** Things HR should look at before saving. Notes, not blocking errors. */
function warningsFor(
  current: EmployeeSalary,
  proposed: EmployeeSalary,
  rates: SalaryRates,
  hasCurrent: boolean
): string[] {
  const out: string[] = [];
  if (rates.usedDefaults) {
    out.push(
      "No company salary structure is saved, so statutory defaults were used: PF 12% and professional tax ₹200/month."
    );
  }
  if (!hasCurrent) {
    out.push(
      `${proposed.employeeId} has no salary on file, so saving this creates their first structure rather than changing one.`
    );
  }
  const curGross = grossOf(current);
  const newGross = grossOf(proposed);
  if (hasCurrent && curGross > 0) {
    const deltaPct = ((newGross - curGross) / curGross) * 100;
    if (newGross < curGross) {
      out.push(
        `This lowers monthly gross from ${inr(curGross)} to ${inr(newGross)} (${deltaPct.toFixed(1)}%). Confirm a reduction is intended.`
      );
    } else if (deltaPct > 40) {
      out.push(
        `This raises monthly gross by ${deltaPct.toFixed(1)}%, well outside a normal revision. Check the band before saving.`
      );
    }
  }
  if (proposed.basicSalary > STATUTORY.pfCeilingWage) {
    out.push(
      `PF is computed on full basic ${inr(proposed.basicSalary)}, above the ₹15,000 EPF wage ceiling. If the company caps PF at the ceiling, edit the PF lines before saving.`
    );
  }
  if (proposed.fixedAllowance < 0) {
    out.push(
      "Fixed allowance came out negative, meaning the fixed components already exceed the target. Do not save without adjusting the target."
    );
  }
  return out;
}

/**
 * Derive a fresh structure from a target CTC. CTC here is gross plus employer
 * PF, so the target is divided by (1 + employer PF rate × basic share) before
 * splitting — otherwise the employer contribution would be counted twice.
 */
export function proposeFromTargetCtc(args: {
  employeeId: string;
  current: EmployeeSalary | null;
  structure: CompanyStructure | null | undefined;
  annualCtc?: number;
  monthlyCtc?: number;
}): SalaryProposal {
  const rates = ratesFrom(args.structure);
  const targetMonthly =
    args.monthlyCtc && args.monthlyCtc > 0
      ? args.monthlyCtc
      : Math.round((args.annualCtc || 0) / 12);
  const gross = round(targetMonthly / (1 + rates.pfEmployerPct * SPLIT.basicOfGross));
  const current = args.current ?? EMPTY_SALARY(args.employeeId);
  const proposed = splitGross(args.employeeId, gross, rates);
  const basis =
    args.annualCtc && args.annualCtc > 0
      ? `target CTC ${inr(args.annualCtc)}/year`
      : `target CTC ${inr(targetMonthly)}/month`;
  return {
    salary: proposed,
    lines: linesFor(current, proposed, mathStrings(proposed, rates, gross)),
    basis,
    monthlyCtc: costOf(proposed),
    note: `Derived from ${basis}: monthly gross ${inr(gross)} plus employer PF ${inr(proposed.pfEmployer)} = ${inr(costOf(proposed))} a month. Nothing is saved until HR presses Save.`,
    warnings: warningsFor(current, proposed, rates, !!args.current),
    rates,
  };
}

/**
 * Scale the structure HR already saved. Preferred over re-deriving for an
 * existing employee, because a component someone set by hand keeps its shape.
 */
export function proposeFromRaise(args: {
  employeeId: string;
  current: EmployeeSalary;
  structure: CompanyStructure | null | undefined;
  raisePct: number;
}): SalaryProposal {
  const rates = ratesFrom(args.structure);
  const factor = 1 + args.raisePct / 100;
  const current: EmployeeSalary = { ...args.current, employeeId: args.employeeId };
  const proposed = scaleSalary(current, factor, rates);
  const gross = grossOf(proposed);
  const basis = `${args.raisePct > 0 ? "+" : ""}${args.raisePct}% on the current structure`;
  return {
    salary: proposed,
    lines: linesFor(
      current,
      proposed,
      mathStrings(proposed, rates, gross, { current, factor })
    ),
    basis,
    monthlyCtc: costOf(proposed),
    note: `Every earning scaled by ${factor.toFixed(4)}, then PF and professional tax re-derived. Monthly gross ${inr(grossOf(current))} → ${inr(gross)}. Nothing is saved until HR presses Save.`,
    warnings: warningsFor(current, proposed, rates, true),
    rates,
  };
}
