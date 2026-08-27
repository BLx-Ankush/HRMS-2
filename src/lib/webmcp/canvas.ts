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
    };
  }
}

/** App-wide singleton. */
export const canvas = new CanvasStore();
