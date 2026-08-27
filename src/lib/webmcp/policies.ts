// Company policy text and capacity heuristics, exposed to the agent as TOOLS.
//
// Note on protocol shape: MCP "resources" and "prompts" are NOT part of the
// WebMCP core surface — `document.modelContext` exposes tool registration only
// (resources/prompts are an MCP-B extension feature). So policy lookup ships as
// an ordinary read-only tool. The agent still cites exact company rules; we just
// stay on the standard, dependency-free native surface.

export interface Policy {
  topic: string;
  title: string;
  rules: string[];
  citation: string;
}

export const POLICIES: Policy[] = [
  {
    topic: "leave",
    title: "Paid & Sick Leave Policy",
    rules: [
      "Paid leave accrues at 20 days per calendar year; unused days do not carry over.",
      "Sick leave is capped at 5 days per calendar year and needs no advance notice.",
      "Requests of 3 or more consecutive days must be filed at least 7 days in advance.",
      "A request is auto-flagged for review when 2 or more teammates in the same department are already away for any overlapping day.",
      "Unpaid leave is unlimited but requires written manager approval.",
    ],
    citation: "Employee Handbook §4 — Time Away From Work",
  },
  {
    topic: "coverage",
    title: "Team Coverage Standard",
    rules: [
      "No department may drop below 60% of its active headcount on any working day.",
      "A departure that takes a department below 60% is a HIGH coverage risk and needs a named delegate before approval.",
      "Between 60% and 75% is a MEDIUM risk: approval is allowed, but a handover note is required.",
      "The requester must nominate a delegate for any absence of 3 or more days.",
    ],
    citation: "Operations Manual §2.3 — Coverage & Delegation",
  },
  {
    topic: "travel",
    title: "Travel & Expense Policy",
    rules: [
      "Meals are reimbursed up to 1,200 per day per traveller.",
      "Alcohol is never reimbursable, including when itemised inside a meal receipt.",
      "Tips are reimbursed up to 10% of the pre-tax food total; anything above 10% is the traveller's cost.",
      "Any single receipt above 5,000 requires an itemised bill, not just a card slip.",
      "Conference travel must be linked to an approved leave or business-travel request.",
    ],
    citation: "Finance Policy §7 — Travel, Meals & Entertainment",
  },
];

export function findPolicy(topic: string): Policy | null {
  const t = topic.trim().toLowerCase();
  if (!t) return null;
  return (
    POLICIES.find((p) => p.topic === t) ??
    POLICIES.find((p) => p.topic.includes(t) || p.title.toLowerCase().includes(t)) ??
    null
  );
}

/** Inclusive day count between two ISO dates; 0 when the range is invalid. */
export function daysBetween(startISO: string, endISO: string): number {
  const a = Date.parse(startISO);
  const b = Date.parse(endISO);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Overlapping days between two inclusive ISO date ranges. */
export function overlapDays(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): number {
  const s = Math.max(Date.parse(aStart), Date.parse(bStart));
  const e = Math.min(Date.parse(aEnd), Date.parse(bEnd));
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86_400_000) + 1;
}

/** Map a remaining-capacity percentage to the handbook's risk bands. */
export function riskFromCapacity(remainingPct: number): "low" | "medium" | "high" {
  if (remainingPct < 60) return "high";
  if (remainingPct < 75) return "medium";
  return "low";
}
