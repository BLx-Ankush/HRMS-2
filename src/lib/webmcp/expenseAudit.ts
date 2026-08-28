// Travel & expense audit — the company's own policy, applied line by line.
//
// The rules here are not invented: they are the five rules in `policies.ts`
// under "travel", which the agent can read for itself via `get_policy("travel")`.
// This module turns them into arithmetic, so every rupee that is disallowed
// carries the rule that disallowed it and the sum that proves it.
//
// Nothing here touches the network. The claim being audited was parsed inside
// the browser tab from a file the human dropped, and never uploaded — which is
// precisely why no server-side API could perform this audit.
import { findPolicy } from "./policies";

/** The three numeric limits stated in Finance Policy §7. */
export const TRAVEL_LIMITS = {
  mealPerDayPerTraveller: 1200,
  tipPctOfPreTaxFood: 0.1,
  itemisationRequiredAbove: 5000,
} as const;

export type ExpenseCategory =
  | "meal"
  | "alcohol"
  | "tip"
  | "tax"
  | "hotel"
  | "transport"
  | "flight"
  | "conference"
  | "other";

/** One claimed line, however it reached us — a file row or a receipt line. */
export interface ExpenseItem {
  /** Stable key for highlighting the row on screen. */
  id: string;
  /** ISO date, or "" when the source never said. */
  date: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  /** Resolved against the live roster; "" when nobody matched. */
  travellerId: string;
  travellerName: string;
  /** Provenance, e.g. "row 4" or "receipt line 7". */
  from: string;
}

export type Verdict = "allowed" | "capped" | "disallowed" | "review";

export interface AuditedItem extends ExpenseItem {
  verdict: Verdict;
  /** Reimbursable share of `amount`. */
  allowed: number;
  /** `amount − allowed`. */
  disallowed: number;
  /** The policy rule that decided this line, quoted. */
  rule: string;
  /** The arithmetic, so a human can check it without trusting us. */
  math: string;
}

/** Per traveller, per day: how the ₹1,200 meal cap was consumed. */
export interface DayCap {
  key: string;
  date: string;
  travellerName: string;
  mealClaimed: number;
  mealAllowed: number;
  cap: number;
  preTaxFood: number;
  tipAllowance: number;
  tipClaimed: number;
}

export interface Breach {
  rule: string;
  detail: string;
  amount: number;
}

export interface ExpenseAudit {
  /** File name, or "pasted receipt text". */
  source: string;
  /** False for a bare card slip — which matters above ₹5,000. */
  itemised: boolean;
  travellers: { travellerId: string; travellerName: string }[];
  items: AuditedItem[];
  claimedTotal: number;
  reimbursableTotal: number;
  disallowedTotal: number;
  /** Claimed but not decided — policy needs a fact only a human holds. */
  heldForReviewTotal: number;
  breaches: Breach[];
  dayCaps: DayCap[];
  /** Lines a human has to judge, because policy needs a fact we do not hold. */
  needsReview: string[];
  notes: string[];
  disclosure: string[];
  policyCitation: string;
  auditedAt: string;
}

/**
 * Published limits of this audit. It ships in the UI and in every tool
 * response, because an audit that hides what it cannot see is worse than no
 * audit — a human stops checking the things it was never able to check.
 */
export const EXPENSE_DISCLOSURE: string[] = [
  "Lines are categorised from their own wording. A bill that calls beer 'refreshments' will be read as food.",
  "This cannot tell whether the trip itself was authorised — only whether an approved request exists for those dates.",
  "It cannot detect the same receipt submitted twice, in this claim or a previous one.",
  "It reads text. A photographed receipt is not read, and nothing here proves a receipt is genuine.",
  "Local tax treatment is not modelled: tax lines are passed through as claimed.",
  "Service charge is treated as a tip, which is the stricter reading of the policy. Confirm before disallowing it.",
];

// Order matters: alcohol and tips are checked before food, so an itemised beer
// inside a restaurant bill is caught rather than absorbed into the meal total.
const CATEGORY_HINTS: [RegExp, ExpenseCategory][] = [
  [
    /\b(beer|lager|ale|pint|draught|stout|wine|whisky|whiskey|scotch|bourbon|vodka|rum|gin|tequila|brandy|champagne|prosecco|cocktail|mojito|martini|sangria|sake|cider|liquor|liqueur|alcohol|alcoholic|bar tab|kingfisher|heineken|budweiser)\b/i,
    "alcohol",
  ],
  [/\b(tip|tips|gratuity|service charge|service fee|servicecharge)\b/i, "tip"],
  [/\b(tax|taxes|gst|cgst|sgst|igst|vat|service tax|levy)\b/i, "tax"],
  [/\b(conference|summit|seminar|workshop|expo|registration|delegate|badge)\b/i, "conference"],
  [/\b(flight|airfare|air fare|airline|airlines|indigo|spicejet|vistara|boarding pass|baggage)\b/i, "flight"],
  [/\b(hotel|room|lodging|accommodation|tariff|stay|check-?in|guest house)\b/i, "hotel"],
  [/\b(taxi|cab|uber|ola|auto|rickshaw|metro|train|rail|bus|fuel|petrol|diesel|parking|toll|mileage)\b/i, "transport"],
  [
    /\b(meal|meals|food|breakfast|lunch|dinner|brunch|restaurant|cafe|coffee|tea|snack|starter|dessert|thali|biryani|dosa|paneer|pizza|burger|sandwich|rice|curry|noodles|juice|soda|water|beverage|refreshment)\b/i,
    "meal",
  ],
];

/**
 * Read a category out of a line's own wording. `fallback` lets the receipt
 * parser say "this is a restaurant bill, so unlabelled lines are food", while a
 * finance export leaves unknown lines as "other" rather than guessing.
 */
export function categorise(description: string, fallback: ExpenseCategory = "other"): ExpenseCategory {
  const text = String(description ?? "");
  for (const [re, category] of CATEGORY_HINTS) if (re.test(text)) return category;
  return fallback;
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

const inr = (n: number): string => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

/** An approved leave or business-travel request found for a traveller. */
export interface LinkedRequest {
  requestId: string;
  status: string;
  startDate: string;
  endDate: string;
}

const groupKeyOf = (item: ExpenseItem): string =>
  `${item.travellerId || item.travellerName || "unknown"}|${item.date || "undated"}`;

/**
 * Apply Finance Policy §7 to a parsed claim.
 *
 * Pure and deterministic: same claim in, same verdicts out. Rule text is quoted
 * from `policies.ts` rather than restated here, so the agent's `get_policy`
 * answer and this audit can never drift apart.
 *
 * `linkedRequests` is supplied by the caller (the tool looks it up against live
 * leave data). Without one, conference spend is held for review rather than
 * silently approved — the policy requires a link we cannot invent.
 */
export function auditExpenses(args: {
  source: string;
  itemised: boolean;
  items: ExpenseItem[];
  linkedRequests?: Record<string, LinkedRequest | null>;
}): ExpenseAudit {
  const policy = findPolicy("travel");
  const rule = (i: number, fallback: string): string => policy?.rules[i] ?? fallback;
  const RULE = {
    meal: rule(0, "Meals are reimbursed up to 1,200 per day per traveller."),
    alcohol: rule(1, "Alcohol is never reimbursable, including when itemised inside a meal receipt."),
    tip: rule(2, "Tips are reimbursed up to 10% of the pre-tax food total."),
    itemised: rule(3, "Any single receipt above 5,000 requires an itemised bill, not just a card slip."),
    conference: rule(4, "Conference travel must be linked to an approved leave or business-travel request."),
    none: "No cap in Finance Policy §7 for this category — passed through as claimed.",
  };

  const items = args.items.filter((i) => Number(i.amount) > 0);
  const links = args.linkedRequests ?? {};

  // Pass one: totals per traveller-day, needed before any line can be judged —
  // the tip allowance depends on that day's food total.
  const groups = new Map<string, DayCap>();
  items.forEach((item) => {
    const key = groupKeyOf(item);
    const g =
      groups.get(key) ??
      {
        key,
        date: item.date || "undated",
        travellerName: item.travellerName || item.travellerId || "unidentified traveller",
        mealClaimed: 0,
        mealAllowed: 0,
        cap: TRAVEL_LIMITS.mealPerDayPerTraveller,
        preTaxFood: 0,
        tipAllowance: 0,
        tipClaimed: 0,
      };
    if (item.category === "meal") {
      g.mealClaimed = round2(g.mealClaimed + item.amount);
      g.preTaxFood = round2(g.preTaxFood + item.amount);
    }
    if (item.category === "tip") g.tipClaimed = round2(g.tipClaimed + item.amount);
    groups.set(key, g);
  });
  groups.forEach((g) => {
    g.tipAllowance = round2(g.preTaxFood * TRAVEL_LIMITS.tipPctOfPreTaxFood);
  });

  // Pass two: judge each line in the order it was claimed, so a cap is spent
  // first-come-first-served and the line that crosses it is the one that shows
  // as capped. Arbitrary orderings would make the same claim audit differently.
  const mealUsed = new Map<string, number>();
  const tipUsed = new Map<string, number>();
  const needsReview: string[] = [];

  const audited: AuditedItem[] = items.map((item) => {
    const key = groupKeyOf(item);
    const g = groups.get(key)!;
    const amount = round2(item.amount);
    const base = { ...item, amount };

    if (item.category === "alcohol") {
      return {
        ...base,
        verdict: "disallowed" as Verdict,
        allowed: 0,
        disallowed: amount,
        rule: RULE.alcohol,
        math: `${inr(amount)} removed in full — alcohol is never reimbursable, itemised inside a meal bill or not.`,
      };
    }

    if (item.category === "tip") {
      const used = tipUsed.get(key) ?? 0;
      const room = Math.max(0, round2(g.tipAllowance - used));
      const allowed = round2(Math.min(amount, room));
      tipUsed.set(key, round2(used + allowed));
      return {
        ...base,
        verdict: (allowed === amount ? "allowed" : allowed > 0 ? "capped" : "disallowed") as Verdict,
        allowed,
        disallowed: round2(amount - allowed),
        rule: RULE.tip,
        math:
          `10% of pre-tax food ${inr(g.preTaxFood)} = ${inr(g.tipAllowance)} allowed for ${g.date}` +
          (used > 0 ? `, ${inr(used)} of it already used` : "") +
          `; ${inr(amount)} claimed, so ${inr(allowed)} reimbursable.`,
      };
    }

    if (item.category === "meal") {
      const used = mealUsed.get(key) ?? 0;
      const room = Math.max(0, round2(g.cap - used));
      const allowed = round2(Math.min(amount, room));
      mealUsed.set(key, round2(used + allowed));
      g.mealAllowed = round2(g.mealAllowed + allowed);
      return {
        ...base,
        verdict: (allowed === amount ? "allowed" : allowed > 0 ? "capped" : "disallowed") as Verdict,
        allowed,
        disallowed: round2(amount - allowed),
        rule: RULE.meal,
        math:
          `${inr(amount)} claimed; ${inr(used)} of the ${inr(g.cap)} daily cap for ${g.travellerName} on ` +
          `${g.date} was already used, leaving ${inr(room)} — so ${inr(allowed)} reimbursable.`,
      };
    }

    if (item.category === "conference") {
      const link = item.travellerId ? links[item.travellerId] : null;
      const approved = !!link && /approve/i.test(link.status);
      if (approved) {
        return {
          ...base,
          verdict: "allowed" as Verdict,
          allowed: amount,
          disallowed: 0,
          rule: RULE.conference,
          math: `Linked to approved request ${link!.requestId} covering ${link!.startDate} → ${link!.endDate}.`,
        };
      }
      needsReview.push(
        `${item.description} (${inr(amount)}) — conference spend with no approved travel request on file for ` +
        `${item.travellerName || "this traveller"}.`
      );
      return {
        ...base,
        verdict: "review" as Verdict,
        allowed: 0,
        disallowed: 0,
        rule: RULE.conference,
        math:
          link
            ? `A request exists (${link.requestId}) but its status is "${link.status}", not approved. Held for you to decide.`
            : `No approved leave or business-travel request found for these dates. Held for you to decide.`,
      };
    }

    // Hotel, transport, flights, tax and anything uncategorised: §7 sets no
    // ceiling, so it passes through claimed rather than being quietly trimmed.
    return {
      ...base,
      verdict: "allowed" as Verdict,
      allowed: amount,
      disallowed: 0,
      rule: RULE.none,
      math: `${inr(amount)} passed through — no ${item.category} limit in Finance Policy §7.`,
    };
  });

  const sum = (pick: (i: AuditedItem) => number): number =>
    round2(audited.reduce((t, i) => t + pick(i), 0));

  const claimedTotal = sum((i) => i.amount);
  const reimbursableTotal = sum((i) => i.allowed);
  const disallowedTotal = sum((i) => i.disallowed);
  const heldForReviewTotal = sum((i) => (i.verdict === "review" ? i.amount : 0));

  // Aggregate one breach per rule, so the human reads five lines rather than
  // fifty, with the money attached to each.
  const breaches: Breach[] = [];
  const byRule = new Map<string, { detail: string[]; amount: number }>();
  audited
    .filter((i) => i.disallowed > 0 || i.verdict === "review")
    .forEach((i) => {
      const entry = byRule.get(i.rule) ?? { detail: [], amount: 0 };
      entry.detail.push(`${i.description} ${inr(i.verdict === "review" ? i.amount : i.disallowed)}`);
      entry.amount = round2(entry.amount + (i.verdict === "review" ? i.amount : i.disallowed));
      byRule.set(i.rule, entry);
    });
  byRule.forEach((entry, ruleText) => {
    breaches.push({ rule: ruleText, detail: entry.detail.join("; "), amount: entry.amount });
  });

  if (!args.itemised && claimedTotal > TRAVEL_LIMITS.itemisationRequiredAbove) {
    breaches.push({
      rule: RULE.itemised,
      detail:
        `${inr(claimedTotal)} claimed from a source with no itemised lines. Ask for the itemised bill ` +
        `before reimbursing — a card slip cannot show whether alcohol was on it.`,
      amount: claimedTotal,
    });
    needsReview.push(
      `The whole claim (${inr(claimedTotal)}) rests on a non-itemised source, and §7 requires itemisation above ${inr(TRAVEL_LIMITS.itemisationRequiredAbove)}.`
    );
  }

  const travellers: { travellerId: string; travellerName: string }[] = [];
  items.forEach((i) => {
    const name = i.travellerName || i.travellerId;
    if (!name) return;
    if (!travellers.some((t) => t.travellerName === name || (t.travellerId && t.travellerId === i.travellerId)))
      travellers.push({ travellerId: i.travellerId, travellerName: name });
  });

  const notes: string[] = [
    `Meal cap ${inr(TRAVEL_LIMITS.mealPerDayPerTraveller)} per traveller per day, spent in the order the lines were claimed.`,
    `Tips capped at ${TRAVEL_LIMITS.tipPctOfPreTaxFood * 100}% of that day's pre-tax food total.`,
    "Tax lines are passed through as claimed; §7 does not cap them.",
  ];
  if (heldForReviewTotal > 0)
    notes.push(
      `${inr(heldForReviewTotal)} is held rather than decided — it needs a fact the policy requires and this audit does not hold.`
    );
  if (!items.length) notes.push("Nothing usable was found in the source, so there is nothing to audit.");

  return {
    source: args.source,
    itemised: args.itemised,
    travellers,
    items: audited,
    claimedTotal,
    reimbursableTotal,
    disallowedTotal,
    heldForReviewTotal,
    breaches,
    dayCaps: Array.from(groups.values()),
    needsReview,
    notes,
    disclosure: EXPENSE_DISCLOSURE,
    policyCitation: policy?.citation ?? "Finance Policy §7 — Travel, Meals & Entertainment",
    auditedAt: new Date().toISOString(),
  };
}

