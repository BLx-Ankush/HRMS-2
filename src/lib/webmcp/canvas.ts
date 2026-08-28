// The shared canvas between the human and the agent.
//
// WebMCP's differentiator over a backend REST API is that tools run *inside the
// page the human is looking at*. This store is the channel for that: agent tool
// calls write intent here (navigate, focus a row, filter the directory, render a
// coverage simulation), and live React components read it and mutate the visible
// UI. The human sees the agent work on their own screen.
//
// It is also read BACK by the `get_page_context` tool, so the agent can ask
// "what is the human currently looking at?" — in-memory state that never
// existed on any server and that a remote API physically cannot see.
import type { ExpenseAudit } from "./expenseAudit";

export interface DirectoryFilter {
  query: string;
  department: string;
  status: string;
}

export interface CoverageConflict {
  /** Leave request id, used to highlight the exact clashing row. */
  requestId: string;
  employeeId: string;
  employeeName: string;
  type: string;
  startDate: string;
  endDate: string;
  overlapDays: number;
}

export interface CoverageSim {
  employeeId: string;
  employeeName: string;
  department: string;
  startDate: string;
  endDate: string;
  requestedDays: number;
  balanceDays: number;
  teamSize: number;
  awayDuringWindow: number;
  capacityDropPct: number;
  conflicts: CoverageConflict[];
  risk: "low" | "medium" | "high";
  note: string;
}

/** One line of a bonus split the agent has proposed but nobody has approved. */
export interface BonusPlanLine {
  employeeId: string;
  employeeName: string;
  score: number;
  sharePct: number;
  amount: number;
  reason: string;
}

/**
 * A proposal drawn on the human's Bonuses page. It is deliberately not a
 * decision: nothing is written to `bonus_awards` until HR presses Record.
 */
export interface BonusPlanCanvas {
  kind: "pool" | "shortlist";
  title: string;
  pool: number;
  method: string;
  window: string;
  lines: BonusPlanLine[];
  excluded: { employeeName: string; why: string }[];
  note: string;
}

/** One component of a salary the agent has worked out but nobody has saved. */
export interface SalaryProposalLine {
  /** Key on EmployeeSalary, so the panel and the commit tool agree on the field. */
  field: string;
  label: string;
  current: number;
  proposed: number;
  /** How the figure was reached, e.g. "40% of ₹1,50,000 monthly CTC". */
  math: string;
  kind: "earning" | "deduction" | "employer";
}

/**
 * A salary structure drawn on the human's Salary Structure page.
 *
 * The agent can compute this but cannot save it: `commit_salary_structure`
 * accepts no amounts and writes only what is sitting here, so the figure that
 * reaches payroll is always the figure the human read on screen.
 */
export interface SalaryProposalCanvas {
  employeeId: string;
  employeeName: string;
  /** Plain-language basis: "target CTC ₹18,00,000/yr", "12% raise on current". */
  basis: string;
  monthlyCtc: number;
  lines: SalaryProposalLine[];
  currentGross: number;
  proposedGross: number;
  currentNet: number;
  proposedNet: number;
  /** Gross plus employer PF — what the company actually spends. */
  employerCost: number;
  note: string;
  /** Things HR should look at before saving (rounding, big jumps, missing config). */
  warnings: string[];
}

/**
 * An expense claim audited against Finance Policy §7 and drawn on the human's
 * Expenses page.
 *
 * The claim it describes was parsed inside this tab from a file or pasted bill
 * and never uploaded, so this object is the only place the audit exists.
 * `record_expense_decision` reads it rather than accepting a figure, which is
 * why the reimbursable total that gets logged is the one HR read on screen.
 */
export interface ExpenseAuditCanvas {
  audit: ExpenseAudit;
  /** Line ids to highlight: everything disallowed, capped or held for review. */
  flagged: string[];
}

export interface CanvasState {
  /** Route the agent asked us to open; cleared once the router honors it. */
  pendingRoute: string | null;
  /** Actual current route, reported by the in-router bridge. */
  currentRoute: string;
  /** Employee row to scroll to and pulse. */
  focusEmployeeId: string | null;
  /** Directory filter the agent applied (drives the real search box). */
  directory: DirectoryFilter;
  /** Leave request ids to highlight as conflicts. */
  highlightLeaveIds: string[];
  /** Rendered coverage simulation banner, if any. */
  coverage: CoverageSim | null;
  /** Contributor row on the Bonuses board to scroll to and pulse. */
  focusContributorId: string | null;
  /** Contribution evidence rows to highlight. */
  highlightContributionIds: string[];
  /** Proposed bonus split / award shortlist rendered on the Bonuses page. */
  bonusPlan: BonusPlanCanvas | null;
  /** Proposed salary structure rendered on the Salary Structure page. */
  salaryProposal: SalaryProposalCanvas | null;
  /** Audited expense claim rendered on the Expenses page. */
  expenseAudit: ExpenseAuditCanvas | null;
  /** Bumped on every agent action so components can re-run animations. */
  pulse: number;
  /** What the visible page is currently showing (published by pages). */
  pageContext: Record<string, unknown>;
}

const EMPTY_FILTER: DirectoryFilter = { query: "", department: "", status: "" };

const INITIAL: CanvasState = {
  pendingRoute: null,
  currentRoute: "/",
  focusEmployeeId: null,
  directory: EMPTY_FILTER,
  highlightLeaveIds: [],
  coverage: null,
  focusContributorId: null,
  highlightContributionIds: [],
  bonusPlan: null,
  salaryProposal: null,
  expenseAudit: null,
  pulse: 0,
  pageContext: {},
};

type Listener = () => void;

class CanvasStore {
  private state: CanvasState = INITIAL;
  private listeners = new Set<Listener>();

  getSnapshot = (): CanvasState => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Merge a patch and notify. `pulse` advances so animations retrigger. */
  private set(patch: Partial<CanvasState>, animate = true) {
    this.state = {
      ...this.state,
      ...patch,
      pulse: animate ? this.state.pulse + 1 : this.state.pulse,
    };
    this.listeners.forEach((fn) => fn());
  }

  // ---------------- agent-facing intents ----------------

  /** Ask the app to navigate. The router bridge performs it and clears it. */
  navigate(route: string) {
    this.set({ pendingRoute: route });
  }

  /** Scroll to + pulse one employee row, filtering the directory to find it. */
  focusEmployee(employeeId: string) {
    this.set({
      pendingRoute: "/employees",
      focusEmployeeId: employeeId,
      directory: { ...EMPTY_FILTER, query: employeeId },
    });
  }

  filterDirectory(filter: Partial<DirectoryFilter>) {
    this.set({
      pendingRoute: "/employees",
      focusEmployeeId: null,
      directory: { ...EMPTY_FILTER, ...filter },
    });
  }

  /** Render a coverage simulation on the leave canvas and flag the clashes. */
  showCoverage(sim: CoverageSim) {
    this.set({
      pendingRoute: "/leave",
      coverage: sim,
      highlightLeaveIds: sim.conflicts.map((c) => c.requestId),
    });
  }

  clearCoverage() {
    this.set({ coverage: null, highlightLeaveIds: [] }, false);
  }

  /** Point the human at specific leave rows (no simulation involved). */
  flagLeaveRequests(ids: string[]) {
    this.set({ pendingRoute: "/leave", highlightLeaveIds: ids });
  }

  // ---------------- bonuses / contribution canvas ----------------

  /** Scroll to + pulse one contributor on the Bonuses board. */
  focusContributor(employeeId: string) {
    this.set({ pendingRoute: "/bonuses", focusContributorId: employeeId });
  }

  /** Highlight specific evidence rows — e.g. the claims HR still has to check. */
  flagContributions(ids: string[]) {
    this.set({ pendingRoute: "/bonuses", highlightContributionIds: ids });
  }

  /** Draw a proposed split or shortlist on the page. Still requires approval. */
  showBonusPlan(plan: BonusPlanCanvas) {
    this.set({
      pendingRoute: "/bonuses",
      bonusPlan: plan,
      focusContributorId: plan.lines[0]?.employeeId ?? null,
    });
  }

  clearBonusPlan() {
    this.set({ bonusPlan: null, focusContributorId: null, highlightContributionIds: [] }, false);
  }

  // ---------------- salary canvas ----------------

  /** Draw a proposed salary structure on the Salary Structure page. Writes nothing. */
  showSalaryProposal(proposal: SalaryProposalCanvas) {
    this.set({ pendingRoute: "/salary-info", salaryProposal: proposal });
  }

  clearSalaryProposal() {
    this.set({ salaryProposal: null }, false);
  }

  // ---------------- expense canvas ----------------

  /**
   * Draw an audited claim on the Expenses page. Writes nothing to the database:
   * the numbers on screen are what `record_expense_decision` later commits.
   */
  showExpenseAudit(audit: ExpenseAudit) {
    this.set({
      pendingRoute: "/expenses",
      expenseAudit: {
        audit,
        flagged: audit.items
          .filter((i) => i.verdict !== "allowed")
          .map((i) => i.id),
      },
    });
  }

  clearExpenseAudit() {
    this.set({ expenseAudit: null }, false);
  }

  // ---------------- app-facing plumbing ----------------

  /** Called by the router bridge once a pending navigation is honored. */
  routeSettled(route: string) {
    this.set({ pendingRoute: null, currentRoute: route }, false);
  }

  /** Pages publish what they are currently rendering, for get_page_context. */
  publishContext(ctx: Record<string, unknown>) {
    this.set({ pageContext: ctx }, false);
  }

  /** Snapshot for the agent: route + what's on screen + active agent overlays. */
  describe(): Record<string, unknown> {
    const s = this.state;
    return {
      currentRoute: s.currentRoute,
      visible: s.pageContext,
      activeDirectoryFilter: s.directory,
      focusedEmployeeId: s.focusEmployeeId,
      coverageSimulationOnScreen: s.coverage
        ? {
            employee: s.coverage.employeeName,
            window: `${s.coverage.startDate} → ${s.coverage.endDate}`,
            risk: s.coverage.risk,
          }
        : null,
      focusedContributorId: s.focusContributorId,
      highlightedContributionCount: s.highlightContributionIds.length,
      bonusPlanOnScreen: s.bonusPlan
        ? {
            kind: s.bonusPlan.kind,
            pool: s.bonusPlan.pool,
            window: s.bonusPlan.window,
            people: s.bonusPlan.lines.length,
            approved: false,
          }
        : null,
      salaryProposalOnScreen: s.salaryProposal
        ? {
            employeeId: s.salaryProposal.employeeId,
            employeeName: s.salaryProposal.employeeName,
            basis: s.salaryProposal.basis,
            proposedNetMonthly: s.salaryProposal.proposedNet,
            saved: false,
          }
        : null,
      expenseAuditOnScreen: s.expenseAudit
        ? {
            source: s.expenseAudit.audit.source,
            itemised: s.expenseAudit.audit.itemised,
            lines: s.expenseAudit.audit.items.length,
            claimedTotal: s.expenseAudit.audit.claimedTotal,
            reimbursableTotal: s.expenseAudit.audit.reimbursableTotal,
            disallowedTotal: s.expenseAudit.audit.disallowedTotal,
            heldForReviewTotal: s.expenseAudit.audit.heldForReviewTotal,
            breaches: s.expenseAudit.audit.breaches.length,
            recorded: false,
          }
        : null,
    };
  }
}

/** App-wide singleton. */
export const canvas = new CanvasStore();
