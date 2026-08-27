// Contribution scoring — deterministic, decomposable, and contestable.
//
// Design stance: this module does NOT produce an opinion about a person. It adds
// up evidence that a human already verified, using weights that are published
// rather than hidden, and it hands back the arithmetic so any number on screen
// can be traced to the specific rows that produced it. The agent reasons over
// this output; HR decides. Nothing here pays anybody.
//
// Why not "unbiased": a score can only see work that was logged and verified,
// so it inherits whoever logs diligently and whatever HR chose to verify. The
// honest claim is auditable, not unbiased — see CONTRIBUTION_DISCLOSURE, which
// is rendered on the page and returned by the scoring tool so the caveat travels
// with the number instead of being buried in a doc.
import type { Contribution, ContributionType } from "@/types/db";

/** Impact multiplier. Set by policy, not derived from data. */
export const IMPACT_WEIGHTS: Record<string, number> = { low: 1, medium: 2, high: 3.5 };

/**
 * Type multiplier. These encode a company's values and are the most arguable
 * numbers in the system, which is exactly why they are exported, surfaced in the
 * UI, and returned by `get_scoring_model` for anyone to push back on.
 */
export const TYPE_WEIGHTS: Record<ContributionType, number> = {
  delivery: 1,
  initiative: 1,
  fix: 0.9,
  improvement: 0.9,
  mentoring: 0.8,
  documentation: 0.7,
  support: 0.6,
};

export const WEIGHT_NOTES: Record<ContributionType, string> = {
  delivery: "Shipped work that reached users.",
  initiative: "Unprompted work that created something new — weighted like delivery on purpose.",
  fix: "Corrected a real defect. Slightly under delivery because the need was already known.",
  improvement: "Made existing work measurably better.",
  mentoring: "Raised someone else's output. Under-counted by nature, so log it.",
  documentation: "Wrote down what others would otherwise re-derive.",
  support: "Kept things running. Lowest weight, and the easiest kind of work to under-log.",
};

export const CONTRIBUTION_DISCLOSURE: string[] = [
  "Only verified contributions count. A claim sitting unverified scores zero, so a backlog of unreviewed work depresses a real contributor's score.",
  "The score can only see work someone logged. People who log diligently look better than people who don't, independent of what they actually did.",
  "Verification is a human judgment made by HR, and it carries whatever bias that person brings.",
  "Type and impact weights are a policy choice, not an objective measure of worth. They are published above so they can be challenged.",
  "Support, mentoring and glue work are systematically under-logged and under-weighted. Read a low score as 'little verified evidence', never as 'low value'.",
  "This is an input to a human decision. It must not be treated as an automatic payout or a ranking of people.",
];

export interface ScoreLine {
  contributionId: string;
  title: string;
  type: ContributionType;
  impact: string;
  occurredOn: string;
  /** typeWeight × impactWeight, rounded to 2dp. */
  points: number;
  /** The arithmetic, spelled out for the drill-down. */
  math: string;
}

export interface EmployeeScore {
  employeeId: string;
  employeeName: string;
  department: string;
  /** Sum of verified points inside the window. */
  score: number;
  rank: number;
  deptRank: number;
  verifiedCount: number;
  pendingCount: number;
  rejectedCount: number;
  /** Points currently blocked behind unverified claims. */
  pendingPoints: number;
  /** Where the points came from, by contribution type. */
  mix: Partial<Record<ContributionType, number>>;
  highImpactCount: number;
  /** Distinct contribution types with at least one verified row. */
  breadth: number;
  /** 0–100 against the company's top scorer, for the progress bar. */
  barPct: number;
  /** 0–100 against the department's top scorer. */
  deptBarPct: number;
  lines: ScoreLine[];
}

export interface ScoreWindow {
  from: string;
  to: string;
  days: number;
}

export interface ScoreBoard {
  window: ScoreWindow;
  employees: EmployeeScore[];
  totalVerified: number;
  totalPending: number;
  /** Company-wide verified points, for share-of-total maths. */
  totalPoints: number;
  weights: { impact: Record<string, number>; type: Record<string, number> };
  disclosure: string[];
}

export interface ScoreOptions {
  /** Length of the review window in days. Default 90. */
  windowDays?: number;
  /** End of the window; defaults to today. ISO date. */
  asOf?: string;
  /** Restrict to one department. */
  department?: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const pointsFor = (row: Contribution): number =>
  round2((TYPE_WEIGHTS[row.type] ?? 0.5) * (IMPACT_WEIGHTS[row.impact] ?? 1));

/** Ranking order. Every step is explicit so two runs can never disagree. */
const byRank = (a: EmployeeScore, b: EmployeeScore): number =>
  b.score - a.score ||
  b.highImpactCount - a.highImpactCount ||
  b.breadth - a.breadth ||
  b.verifiedCount - a.verifiedCount ||
  a.employeeId.localeCompare(b.employeeId);

/**
 * Turn raw contribution rows into a ranked, decomposed scoreboard.
 * Only `verified` rows earn points; `claimed` rows are counted and their
 * potential points reported separately so an unreviewed backlog is visible
 * rather than silently punishing the person who filed them.
 */
export function scoreContributions(rows: Contribution[], opts: ScoreOptions = {}): ScoreBoard {
  const windowDays = opts.windowDays && opts.windowDays > 0 ? Math.floor(opts.windowDays) : 90;
  const to = (opts.asOf || "").trim() || isoDate(new Date());
  const fromDate = new Date(`${to}T00:00:00`);
  fromDate.setDate(fromDate.getDate() - (windowDays - 1));
  const from = isoDate(fromDate);
  const deptFilter = String(opts.department ?? "").trim().toLowerCase();

  const inWindow = (rows ?? []).filter((r) => {
    const on = String(r.occurredOn ?? "");
    if (!on || on < from || on > to) return false;
    if (deptFilter && String(r.department ?? "").toLowerCase() !== deptFilter) return false;
    return true;
  });

  const blank = (row: Contribution): EmployeeScore => ({
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    department: row.department ?? "",
    score: 0, rank: 0, deptRank: 0,
    verifiedCount: 0, pendingCount: 0, rejectedCount: 0, pendingPoints: 0,
    mix: {}, highImpactCount: 0, breadth: 0, barPct: 0, deptBarPct: 0, lines: [],
  });

  const byEmployee = new Map<string, EmployeeScore>();
  for (const row of inWindow) {
    if (!row.employeeId) continue;
    let e = byEmployee.get(row.employeeId);
    if (!e) { e = blank(row); byEmployee.set(row.employeeId, e); }
    const points = pointsFor(row);

    if (row.status === "verified") {
      e.score = round2(e.score + points);
      e.verifiedCount += 1;
      e.mix[row.type] = round2((e.mix[row.type] ?? 0) + points);
      if (row.impact === "high") e.highImpactCount += 1;
      e.lines.push({
        contributionId: row.id, title: row.title, type: row.type, impact: row.impact,
        occurredOn: row.occurredOn, points,
        math: `${TYPE_WEIGHTS[row.type] ?? 0.5} (${row.type}) × ${IMPACT_WEIGHTS[row.impact] ?? 1} (${row.impact} impact) = ${points}`,
      });
    } else if (row.status === "claimed") {
      e.pendingCount += 1;
      e.pendingPoints = round2(e.pendingPoints + points);
    } else {
      e.rejectedCount += 1;
    }
  }

  const employees = Array.from(byEmployee.values());
  for (const e of employees) {
    e.breadth = Object.keys(e.mix).length;
    e.lines.sort((a, b) => b.points - a.points || a.occurredOn.localeCompare(b.occurredOn));
  }
  employees.sort(byRank);

  const topScore = employees.length ? employees[0].score : 0;
  const deptTop = new Map<string, number>();
  for (const e of employees) {
    const key = e.department || "—";
    if (!deptTop.has(key) || e.score > deptTop.get(key)) deptTop.set(key, e.score);
  }
  const deptSeen = new Map<string, number>();
  employees.forEach((e, i) => {
    e.rank = i + 1;
    const key = e.department || "—";
    const seen = (deptSeen.get(key) ?? 0) + 1;
    deptSeen.set(key, seen);
    e.deptRank = seen;
    e.barPct = topScore > 0 ? Math.round((e.score / topScore) * 100) : 0;
    const dTop = deptTop.get(key) ?? 0;
    e.deptBarPct = dTop > 0 ? Math.round((e.score / dTop) * 100) : 0;
  });

  return {
    window: { from, to, days: windowDays },
    employees,
    totalVerified: employees.reduce((n, e) => n + e.verifiedCount, 0),
    totalPending: employees.reduce((n, e) => n + e.pendingCount, 0),
    totalPoints: round2(employees.reduce((n, e) => n + e.score, 0)),
    weights: { impact: IMPACT_WEIGHTS, type: TYPE_WEIGHTS },
    disclosure: CONTRIBUTION_DISCLOSURE,
  };
}

export interface BonusLine {
  employeeId: string;
  employeeName: string;
  department: string;
  score: number;
  rank: number;
  sharePct: number;
  amount: number;
  reason: string;
}

export interface BonusAllocation {
  pool: number;
  method: string;
  lines: BonusLine[];
  /** Left over after rounding; always given to the top-ranked contributor. */
  unallocated: number;
  excluded: { employeeId: string; employeeName: string; why: string }[];
  disclosure: string[];
}

/**
 * Split a bonus pool in proportion to verified contribution points.
 * Anyone with no verified evidence in the window is excluded and named, so an
 * omission is a visible decision rather than a silent one.
 */
export function allocateBonusPool(
  board: ScoreBoard,
  pool: number,
  opts: { rounding?: number; minScore?: number } = {}
): BonusAllocation {
  const rounding = opts.rounding && opts.rounding > 0 ? opts.rounding : 1;
  const minScore = opts.minScore ?? 0;

  const eligible = board.employees.filter((e) => e.score > 0 && e.score >= minScore);
  const eligibleIds = new Set(eligible.map((e) => e.employeeId));
  const excluded = board.employees
    .filter((e) => !eligibleIds.has(e.employeeId))
    .map((e) => ({
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      why: e.pendingCount
        ? `no verified contributions in the window — ${e.pendingCount} claim(s) still awaiting HR review`
        : "no verified contributions in the window",
    }));

  const total = round2(eligible.reduce((n, e) => n + e.score, 0));
  const lines: BonusLine[] = eligible.map((e) => {
    const share = total > 0 ? e.score / total : 0;
    return {
      employeeId: e.employeeId, employeeName: e.employeeName, department: e.department,
      score: e.score, rank: e.rank, sharePct: Math.round(share * 1000) / 10,
      amount: Math.floor((pool * share) / rounding) * rounding,
      reason: `${e.score} pts from ${e.verifiedCount} verified contribution(s), ${e.highImpactCount} high-impact`,
    };
  });

  // Rounding down leaves a remainder; hand it to the top contributor rather
  // than letting the pool silently not add up.
  const handed = lines.reduce((n, l) => n + l.amount, 0);
  const remainder = round2(pool - handed);
  if (lines.length && remainder > 0) {
    lines[0].amount = round2(lines[0].amount + remainder);
    lines[0].reason += ` (+${remainder} rounding remainder, as top contributor)`;
  }

  return {
    pool,
    method: `proportional to verified points over ${board.window.from} → ${board.window.to}, rounded down to the nearest ${rounding}`,
    lines,
    unallocated: lines.length ? 0 : remainder,
    excluded,
    disclosure: CONTRIBUTION_DISCLOSURE,
  };
}

export interface ShortlistEntry {
  employeeId: string;
  employeeName: string;
  department: string;
  score: number;
  rank: number;
  why: string;
}

export interface Shortlist {
  entries: ShortlistEntry[];
  tieBreakOrder: string[];
  /** Set when #1 and #2 are within 5% — the evidence does not separate them. */
  tooCloseToCall: boolean;
  note: string;
  disclosure: string[];
}

/** Best-employee shortlist with the tie-break order stated, not implied. */
export function awardShortlist(board: ScoreBoard, count = 3): Shortlist {
  const entries: ShortlistEntry[] = board.employees.slice(0, Math.max(1, count)).map((e) => ({
    employeeId: e.employeeId, employeeName: e.employeeName, department: e.department,
    score: e.score, rank: e.rank,
    why:
      `${e.score} pts from ${e.verifiedCount} verified item(s) across ${e.breadth} kind(s) of work, ` +
      `${e.highImpactCount} high-impact` +
      (e.pendingCount ? `; ${e.pendingCount} further claim(s) not yet verified` : ""),
  }));

  const top = board.employees[0];
  const second = board.employees[1];
  const tooCloseToCall = !!(top && second && top.score > 0 && (top.score - second.score) / top.score < 0.05);

  return {
    entries,
    tieBreakOrder: [
      "verified points", "count of high-impact items",
      "breadth (distinct kinds of work)", "number of verified items", "employee ID",
    ],
    tooCloseToCall,
    note: tooCloseToCall
      ? `${top.employeeName} and ${second.employeeName} are within 5% of each other — the evidence does not separate them, so this is a human judgment, not a ranking outcome.`
      : "Ranked on verified evidence inside the review window only.",
    disclosure: CONTRIBUTION_DISCLOSURE,
  };
}
