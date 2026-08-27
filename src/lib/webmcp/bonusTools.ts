// Contribution + bonus WebMCP tools.
//
// The design point of this file: the agent can compute, argue, and draw on the
// human's screen, but it cannot decide. Reads are decomposed down to the
// arithmetic behind every number, writes are approval-gated, and the one tool
// that commits money can only commit the proposal the human is already looking
// at — so an agent cannot invent a payout that never appeared on screen.
//
// Two of these tools have no possible REST equivalent:
//   * `read_contribution_import` reads a file that was parsed in this tab and
//     never uploaded anywhere. There is no URL a server could fetch.
//   * `record_bonus_decision` reads the proposal held in live page state, which
//     exists only in the browser the human is using.
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { McpToolDescriptor } from "./types";
import { textResult, jsonResult } from "./registry";
import { requireApproval } from "./approval";
import { canvas } from "./canvas";
import { contributionImport } from "./importContributions";
import {
  CONTRIBUTION_DISCLOSURE, IMPACT_WEIGHTS, TYPE_WEIGHTS, WEIGHT_NOTES,
  allocateBonusPool, awardShortlist, scoreContributions,
} from "./contributionScore";
import type { Contribution, ContributionType } from "@/types/db";

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
const strEnum = (description: string, values: string[]) => ({ type: "string", description, enum: values });

const TYPE_VALUES: ContributionType[] = [
  "delivery", "initiative", "fix", "improvement", "mentoring", "documentation", "support",
];
const IMPACT_VALUES = ["low", "medium", "high"];

const toContribution = (r: any): Contribution => ({
  id: r.id, employeeId: r.employee_id, employeeName: r.employee_name, department: r.department ?? "",
  title: r.title, detail: r.detail ?? "", type: r.type, impact: r.impact,
  occurredOn: r.occurred_on, link: r.link ?? "", status: r.status,
  verifiedBy: r.verified_by ?? "", verifiedAt: r.verified_at ?? undefined, source: r.source ?? "self",
});

/** Every contribution row, mapped. Scoring is pure, so it runs on the client. */
async function loadContributions(): Promise<Contribution[]> {
  const { data, error } = await supabase
    .from("contributions").select("*").order("occurred_on", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toContribution);
}

export interface ContributionToolContext {
  role: "admin" | "employee";
  employeeId?: string;
}

/** Tools every signed-in user gets: the published model, own evidence, own log. */
export function buildContributionTools(
  qc: QueryClient,
  ctx: ContributionToolContext
): McpToolDescriptor[] {
  const myId = s(ctx.employeeId).toUpperCase();

  return [
    {
      name: "get_scoring_model",
      title: "Read the contribution scoring model",
      annotations: { readOnlyHint: true, idempotentHint: true },
      description:
        "Return the exact weights used to turn contributions into points, the rationale for each weight, and the published limitations of the score. Call this before interpreting or arguing about any contribution number so you quote the real policy rather than guessing at it.",
      inputSchema: obj({}),
      execute: async () =>
        jsonResult({
          formula: "points = typeWeight × impactWeight, summed over VERIFIED rows inside the window",
          impactWeights: IMPACT_WEIGHTS,
          typeWeights: TYPE_WEIGHTS,
          weightRationale: WEIGHT_NOTES,
          onlyVerifiedRowsScore: true,
          defaultWindowDays: 90,
          limitations: CONTRIBUTION_DISCLOSURE,
          intendedUse:
            "An input to a human bonus or award decision. Never present it as an automatic payout or as a ranking of people's worth.",
        }),
    },
    {
      name: "get_my_contributions",
      title: "Read my own contribution record",
      annotations: { readOnlyHint: true, idempotentHint: true },
      description:
        "Return the signed-in user's own contributions, their score, rank, the arithmetic behind each point, and how many points are still blocked behind unverified claims. Use for 'how am I doing', 'what is my contribution score', or 'what is waiting on HR'.",
      inputSchema: obj({
        windowDays: num("Review window length in days. Defaults to 90."),
      }),
      execute: async (args) => {
        if (!myId) return { ...textResult("No employee ID on the signed-in profile."), isError: true };
        const rows = await loadContributions();
        const board = scoreContributions(rows, { windowDays: n(args.windowDays, 90) });
        const me = board.employees.find((e) => e.employeeId === myId);
        const mine = rows.filter((r) => r.employeeId === myId);
        return jsonResult({
          employeeId: myId,
          window: board.window,
          score: me?.score ?? 0,
          rankInCompany: me?.rank ?? null,
          rankInDepartment: me?.deptRank ?? null,
          percentOfTopScorer: me?.barPct ?? 0,
          verifiedCount: me?.verifiedCount ?? 0,
          awaitingVerification: me?.pendingCount ?? 0,
          pointsBlockedByVerification: me?.pendingPoints ?? 0,
          pointsByType: me?.mix ?? {},
          evidence: me?.lines ?? [],
          allRowsIncludingOutsideWindow: mine.map((r) => ({
            id: r.id, title: r.title, type: r.type, impact: r.impact,
            occurredOn: r.occurredOn, status: r.status, source: r.source, link: r.link,
          })),
          limitations: CONTRIBUTION_DISCLOSURE,
        });
      },
    },
    {
      name: "log_contribution",
      title: "Log a contribution for the signed-in user",
      annotations: { readOnlyHint: false, idempotentHint: false },
      description:
        "Record a piece of work the signed-in user did, as a claim awaiting HR verification. Requires the human to confirm in-page first. Filing under someone else's ID is refused. Attach an evidence link whenever the user mentions one — unverifiable claims tend not to get verified.",
      inputSchema: obj(
        {
          title: str("Short description of the work, e.g. 'Rebuilt the payroll pipeline'."),
          detail: str("What changed and what it achieved."),
          type: strEnum("Kind of work. Drives the type weight.", TYPE_VALUES),
          impact: strEnum("How much it mattered. Drives the impact weight.", IMPACT_VALUES),
          occurredOn: str("Date the work landed, YYYY-MM-DD. Defaults to today."),
          link: str("Evidence URL — PR, ticket, or doc."),
        },
        ["title"]
      ),
      execute: async (args) => {
        if (!myId) return { ...textResult("No employee ID on the signed-in profile."), isError: true };
        const title = s(args.title);
        if (!title) return { ...textResult("A title is required."), isError: true };
        const type = (s(args.type) || "delivery") as ContributionType;
        const impact = s(args.impact) || "medium";
        const occurredOn = s(args.occurredOn) || new Date().toISOString().slice(0, 10);

        const { data: me, error: meErr } = await supabase
          .from("profiles").select("id,name,department").eq("employee_id", myId).maybeSingle();
        if (meErr) throw meErr;

        const points = (TYPE_WEIGHTS[type] ?? 0.5) * (IMPACT_WEIGHTS[impact] ?? 1);
        const ok = await requireApproval({
          title: "Log contribution",
          summary: `Log "${title}" for ${me?.name ?? myId}`,
          details: {
            What: title, Kind: type, Impact: impact, When: occurredOn,
            ...(s(args.link) ? { Evidence: s(args.link) } : { Evidence: "none attached" }),
            "Worth if verified": `${Math.round(points * 100) / 100} pts`,
            Status: "claimed — scores nothing until HR verifies it",
          },
          confirmLabel: "Log contribution",
        });
        if (!ok) return textResult(`Cancelled — "${title}" was not logged.`);

        const { error } = await supabase.from("contributions").insert({
          profile_id: me?.id ?? null, employee_id: myId, employee_name: me?.name ?? myId,
          department: me?.department ?? "", title, detail: s(args.detail),
          type, impact, occurred_on: occurredOn, link: s(args.link),
          status: "claimed", source: "self",
        });
        if (error) return { ...textResult(error.message), isError: true };
        await supabase.from("activities").insert({
          type: "contribution", actor_name: me?.name ?? myId, action: "logged a contribution",
        });
        invalidate(qc, [["contributions"], ["activities"], ["stats"]]);
        canvas.focusContributor(myId);
        return textResult(
          `Logged "${title}" as a claim (${type}, ${impact} impact, ${occurredOn}). It is worth ` +
          `${Math.round(points * 100) / 100} pts once HR verifies it, and zero until then.`
        );
      },
    },
  ];
}

/** Admin-only: the board, verification, the import reader, and the proposals. */
export function buildBonusAdminTools(qc: QueryClient): McpToolDescriptor[] {
  return [
    {
      name: "get_contribution_scores",
      title: "Read the contribution scoreboard",
      annotations: { readOnlyHint: true, idempotentHint: true },
      description:
        "Rank employees by verified contribution points over a review window, with the arithmetic behind every number, the points each person has blocked behind unverified claims, and the published limits of the score. This is evidence for a human bonus decision, not a verdict — quote the limitations when you summarise it.",
      inputSchema: obj({
        windowDays: num("Review window length in days. Defaults to 90."),
        asOf: str("End of the window, YYYY-MM-DD. Defaults to today."),
        department: str("Restrict to one department, e.g. 'Engineering'."),
        includeEvidence: str("Set to 'true' to include the per-row arithmetic for each person."),
        limit: num("Return only the top N contributors."),
      }),
      execute: async (args) => {
        const rows = await loadContributions();
        const board = scoreContributions(rows, {
          windowDays: n(args.windowDays, 90),
          asOf: s(args.asOf),
          department: s(args.department),
        });
        const withEvidence = s(args.includeEvidence).toLowerCase() === "true";
        const limit = n(args.limit, 0);
        const list = limit > 0 ? board.employees.slice(0, limit) : board.employees;
        return jsonResult({
          window: board.window,
          totalVerifiedRows: board.totalVerified,
          totalPendingClaims: board.totalPending,
          totalPoints: board.totalPoints,
          weights: board.weights,
          employees: list.map((e) => ({
            rank: e.rank, employeeId: e.employeeId, employeeName: e.employeeName,
            department: e.department, deptRank: e.deptRank, score: e.score,
            percentOfTopScorer: e.barPct, verifiedCount: e.verifiedCount,
            awaitingVerification: e.pendingCount, pointsBlockedByVerification: e.pendingPoints,
            highImpactCount: e.highImpactCount, breadth: e.breadth, pointsByType: e.mix,
            ...(withEvidence ? { evidence: e.lines } : {}),
          })),
          limitations: board.disclosure,
        });
      },
    },
    {
      name: "review_pending_contributions",
      title: "Show HR the claims blocking real scores",
      annotations: { readOnlyHint: false, idempotentHint: true },
      description:
        "List contributions still awaiting verification and highlight those rows on the HR user's Bonuses screen. Use when asked what is waiting for review, or before proposing bonuses — an unreviewed backlog silently depresses whoever filed it.",
      inputSchema: obj({
        employeeId: str("Restrict to one employee, e.g. 'EMP005'."),
      }),
      execute: async (args) => {
        const rows = await loadContributions();
        const wanted = s(args.employeeId).toUpperCase();
        const pending = rows.filter(
          (r) => r.status === "claimed" && (!wanted || r.employeeId === wanted)
        );
        canvas.flagContributions(pending.map((r) => r.id));
        const worth = pending.reduce(
          (t, r) => t + (TYPE_WEIGHTS[r.type] ?? 0.5) * (IMPACT_WEIGHTS[r.impact] ?? 1), 0
        );
        return jsonResult({
          highlightedOnScreen: pending.length,
          pointsCurrentlyNotCounting: Math.round(worth * 100) / 100,
          claims: pending.map((r) => ({
            contributionId: r.id, employeeId: r.employeeId, employeeName: r.employeeName,
            title: r.title, detail: r.detail, type: r.type, impact: r.impact,
            occurredOn: r.occurredOn, link: r.link, source: r.source,
            hasEvidenceLink: !!r.link,
          })),
          note:
            "Verification is a human judgment. Recommend, but do not imply these should be waved through — rows with no evidence link are the ones to question.",
        });
      },
    },
    {
      name: "verify_contribution",
      title: "Verify or reject a contribution claim",
      annotations: { readOnlyHint: false, idempotentHint: false },
      description:
        "Mark one contribution claim as verified (it starts counting towards the score) or rejected (it never counts). Requires human confirmation in-page. State the evidence you are relying on when you propose it.",
      inputSchema: obj(
        {
          contributionId: str("The contribution row id to decide on."),
          decision: strEnum("What to record.", ["verified", "rejected"]),
          verifiedBy: str("Name to record as the verifier. Defaults to the signed-in HR user."),
        },
        ["contributionId", "decision"]
      ),
      execute: async (args) => {
        const id = s(args.contributionId);
        const decision = s(args.decision);
        if (!id) return { ...textResult("contributionId is required."), isError: true };
        if (decision !== "verified" && decision !== "rejected")
          return { ...textResult("decision must be 'verified' or 'rejected'."), isError: true };

        const { data: row, error: rowErr } = await supabase
          .from("contributions").select("*").eq("id", id).maybeSingle();
        if (rowErr) throw rowErr;
        if (!row) return { ...textResult(`No contribution found with id ${id}.`), isError: true };

        const c = toContribution(row);
        const points = Math.round((TYPE_WEIGHTS[c.type] ?? 0.5) * (IMPACT_WEIGHTS[c.impact] ?? 1) * 100) / 100;
        const ok = await requireApproval({
          title: decision === "verified" ? "Verify contribution" : "Reject contribution",
          summary: `${decision === "verified" ? "Verify" : "Reject"} "${c.title}" for ${c.employeeName}`,
          details: {
            Employee: `${c.employeeName} (${c.employeeId})`,
            What: c.title, Detail: c.detail || "—", Kind: c.type, Impact: c.impact,
            When: c.occurredOn, Evidence: c.link || "none attached", "Logged via": c.source,
            Effect: decision === "verified"
              ? `adds ${points} pts to their score`
              : `permanently scores 0 — this is a judgment about the evidence`,
          },
          confirmLabel: decision === "verified" ? "Verify" : "Reject",
          destructive: decision === "rejected",
        });
        if (!ok) return textResult(`Cancelled — "${c.title}" is unchanged.`);

        const verifier = s(args.verifiedBy) || "HR";
        const { error } = await supabase.from("contributions").update({
          status: decision, verified_by: verifier, verified_at: new Date().toISOString(),
        }).eq("id", id);
        if (error) return { ...textResult(error.message), isError: true };
        invalidate(qc, [["contributions"], ["stats"]]);
        canvas.focusContributor(c.employeeId);
        return textResult(
          decision === "verified"
            ? `Verified "${c.title}" — ${c.employeeName} gains ${points} pts.`
            : `Rejected "${c.title}" — it will not count towards ${c.employeeName}'s score.`
        );
      },
    },
    {
      name: "read_contribution_import",
      title: "Read the work-export file loaded in this tab",
      annotations: { readOnlyHint: true, idempotentHint: true },
      description:
        "Read the contribution export the HR user dropped onto the Bonuses page. The file was parsed in this browser tab and never uploaded anywhere, so this is the only way to see it — there is no URL or API a server could fetch it from. Use it to sanity-check the column mapping, spot authors who match nobody on the roster, and summarise what would be logged before the human commits it.",
      inputSchema: obj({
        includeRows: str("Set to 'false' to return only the summary and skip the row list."),
        limit: num("Return at most this many rows. Defaults to 50."),
      }),
      execute: async (args) => {
        const parsed = contributionImport.getSnapshot();
        if (!parsed)
          return jsonResult({
            loaded: false,
            hint:
              "Nothing is loaded. Ask the HR user to drop a CSV, TSV or JSON work export onto the " +
              "import card on the Bonuses page — the file is read in the browser and never uploaded.",
          });
        const wantRows = s(args.includeRows).toLowerCase() !== "false";
        const limit = n(args.limit, 50);
        const rows = wantRows ? parsed.rows.slice(0, limit > 0 ? limit : 50) : [];
        return jsonResult({
          ...contributionImport.describe(),
          matchedToRoster: parsed.rows.filter((r) => r.employeeId).length,
          unmatchedRowCount: parsed.rows.filter((r) => !r.employeeId).length,
          skippedLines: parsed.skipped,
          rows: rows.map((r) => ({
            employeeId: r.employeeId || null, employeeName: r.employeeName,
            authorInFile: r.who, title: r.title, type: r.type, impact: r.impact,
            occurredOn: r.occurredOn, link: r.link, inferredFrom: r.from,
            wouldBeLogged: !!r.employeeId,
          })),
          rowsReturned: rows.length,
          note:
            "Type and impact were inferred from the file's own wording where the export did not state them. " +
            "Rows with no employeeId match nobody on the roster and will not be logged. Nothing here has " +
            "been written to the database — the human presses the log button on the page.",
        });
      },
    },
    {
      name: "propose_bonus_pool",
      title: "Draw a bonus split on the HR user's screen",
      annotations: { readOnlyHint: false, idempotentHint: true },
      description:
        "Split a bonus pool in proportion to verified contribution points and render the proposal on the HR user's Bonuses page. Writes nothing and pays nobody — it puts a reviewable plan on screen. Call this before record_bonus_decision; that tool can only commit a plan that is already displayed.",
      inputSchema: obj(
        {
          pool: num("Total money to split, in rupees."),
          windowDays: num("Review window length in days. Defaults to 90."),
          asOf: str("End of the window, YYYY-MM-DD. Defaults to today."),
          department: str("Restrict the split to one department."),
          rounding: num("Round each amount down to a multiple of this. Defaults to 100."),
          minScore: num("Exclude anyone below this many verified points."),
        },
        ["pool"]
      ),
      execute: async (args) => {
        const pool = n(args.pool, 0);
        if (pool <= 0) return { ...textResult("pool must be a positive amount."), isError: true };
        const rows = await loadContributions();
        const dept = s(args.department);
        const board = scoreContributions(rows, {
          windowDays: n(args.windowDays, 90), asOf: s(args.asOf), department: dept,
        });
        const plan = allocateBonusPool(board, pool, {
          rounding: n(args.rounding, 100), minScore: n(args.minScore, 0),
        });
        if (!plan.lines.length)
          return {
            ...textResult(
              "Nobody has verified contributions in that window, so there is nothing to split. " +
              "Run review_pending_contributions — the evidence may be sitting unverified."
            ),
            isError: true,
          };

        const window = `${board.window.from} → ${board.window.to}`;
        canvas.showBonusPlan({
          kind: "pool",
          title: dept ? `Bonus split — ${dept}` : "Bonus split — all departments",
          pool, method: plan.method, window,
          lines: plan.lines.map((l) => ({
            employeeId: l.employeeId, employeeName: l.employeeName, score: l.score,
            sharePct: l.sharePct, amount: l.amount, reason: l.reason,
          })),
          excluded: plan.excluded.map((e) => ({ employeeName: e.employeeName, why: e.why })),
          note:
            "Proportional to verified points only. It cannot see work nobody logged, and it is an input " +
            "to your decision, not the decision.",
        });
        return jsonResult({
          drawnOnScreen: true,
          savedToDatabase: false,
          window, pool, method: plan.method,
          allocated: plan.lines.reduce((t, l) => t + l.amount, 0),
          lines: plan.lines,
          excluded: plan.excluded,
          pendingClaimsInWindow: board.totalPending,
          limitations: plan.disclosure,
          nextStep:
            "The plan is now on the HR user's screen. Talk them through it — especially who was left out " +
            "and why — then call record_bonus_decision if they want it committed.",
        });
      },
    },
    {
      name: "get_award_shortlist",
      title: "Shortlist candidates for a best-employee award",
      annotations: { readOnlyHint: false, idempotentHint: true },
      description:
        "Rank the strongest contributors for an award, state the tie-break order used, and flag when the top two are too close for the evidence to separate them. Draws the shortlist on the HR user's screen. Use for 'who deserves employee of the month' — and report the too-close-to-call flag if it is set instead of picking for them.",
      inputSchema: obj({
        count: num("How many candidates to shortlist. Defaults to 3."),
        windowDays: num("Review window length in days. Defaults to 90."),
        asOf: str("End of the window, YYYY-MM-DD. Defaults to today."),
        department: str("Restrict to one department."),
      }),
      execute: async (args) => {
        const rows = await loadContributions();
        const dept = s(args.department);
        const board = scoreContributions(rows, {
          windowDays: n(args.windowDays, 90), asOf: s(args.asOf), department: dept,
        });
        const list = awardShortlist(board, n(args.count, 3));
        if (!list.entries.length || !list.entries[0].score)
          return {
            ...textResult(
              "No verified contributions in that window, so there is no evidence to shortlist on."
            ),
            isError: true,
          };

        const window = `${board.window.from} → ${board.window.to}`;
        canvas.showBonusPlan({
          kind: "shortlist",
          title: dept ? `Award shortlist — ${dept}` : "Award shortlist",
          pool: 0,
          method: `ranked on verified points, tie-broken by: ${list.tieBreakOrder.join(" → ")}`,
          window,
          lines: list.entries.map((e) => ({
            employeeId: e.employeeId, employeeName: e.employeeName, score: e.score,
            sharePct: 0, amount: 0, reason: e.why,
          })),
          excluded: [],
          note: list.note,
        });
        return jsonResult({
          drawnOnScreen: true,
          savedToDatabase: false,
          window,
          candidates: list.entries,
          tieBreakOrder: list.tieBreakOrder,
          tooCloseToCall: list.tooCloseToCall,
          note: list.note,
          pendingClaimsInWindow: board.totalPending,
          limitations: list.disclosure,
          howToReport: list.tooCloseToCall
            ? "Say plainly that the evidence does not separate the top two, and let the human choose."
            : "Present this as the evidence, not the verdict — quote the limitations.",
        });
      },
    },
    {
      name: "record_bonus_decision",
      title: "Record the bonus plan currently on screen",
      annotations: { readOnlyHint: false, idempotentHint: false },
      description:
        "Commit the bonus plan the HR user is looking at right now. It takes no amounts as arguments — it reads the proposal held in this page's live state, so it can only ever pay out figures the human has already seen on their own screen. Requires in-page confirmation. Call propose_bonus_pool or get_award_shortlist first; there is nothing to record until a plan is displayed.",
      inputSchema: obj({
        period: str("Label to file these under, e.g. '2026-Q3'. Defaults to the plan's window."),
        reason: str("One line for the record, e.g. 'Q3 contribution bonus'."),
        decidedBy: str("Name to record as the decision-maker. Defaults to the signed-in HR user."),
      }),
      execute: async (args) => {
        const plan = canvas.getSnapshot().bonusPlan;
        if (!plan)
          return {
            ...textResult(
              "No bonus plan is on screen, so there is nothing to record. Call propose_bonus_pool " +
              "(or get_award_shortlist) first so the human can see what they would be approving."
            ),
            isError: true,
          };
        const kind = plan.kind === "shortlist" ? "award" : "bonus";
        const payable = plan.lines.filter((l) => kind === "award" || l.amount > 0);
        if (!payable.length)
          return { ...textResult("Every line on the displayed plan is zero — nothing to record."), isError: true };

        const period = s(args.period) || plan.window;
        const total = payable.reduce((t, l) => t + l.amount, 0);
        const ok = await requireApproval({
          title: kind === "award" ? "Record award shortlist" : "Record bonus payments",
          summary: kind === "award"
            ? `Record ${payable.length} award decision(s) for ${period}`
            : `Record ₹${total.toLocaleString("en-IN")} across ${payable.length} people for ${period}`,
          details: {
            Plan: plan.title,
            Window: plan.window,
            Basis: plan.method,
            ...(kind === "bonus" ? { Total: `₹${total.toLocaleString("en-IN")}` } : {}),
            People: payable
              .map((l) => `${l.employeeName}${kind === "bonus" ? ` ₹${l.amount.toLocaleString("en-IN")}` : ""}`)
              .join(", "),
            ...(plan.excluded.length ? { "Left out": plan.excluded.map((e) => e.employeeName).join(", ") } : {}),
            Note: "Re-recording the same period replaces the earlier figure rather than paying twice.",
          },
          confirmLabel: kind === "award" ? "Record awards" : "Record payments",
        });
        if (!ok) return textResult("Cancelled — nothing was recorded and the plan is still on screen.");

        const ids = payable.map((l) => l.employeeId);
        const { data: profs, error: profErr } = await supabase
          .from("profiles").select("id,employee_id").in("employee_id", ids);
        if (profErr) throw profErr;
        const profileByEmp = new Map((profs ?? []).map((p: any) => [p.employee_id, p.id]));

        const decidedBy = s(args.decidedBy) || "HR";
        const reason = s(args.reason) ||
          (kind === "award" ? "Best-employee shortlist" : "Contribution-based bonus");
        const { error } = await supabase.from("bonus_awards").upsert(
          payable.map((l, i) => ({
            profile_id: profileByEmp.get(l.employeeId) ?? null,
            employee_id: l.employeeId, employee_name: l.employeeName,
            period, amount: l.amount, score: l.score, rank: i + 1,
            kind, reason: `${reason} — ${l.reason}`, decided_by: decidedBy,
          })),
          { onConflict: "employee_id,period,kind" }
        );
        if (error) return { ...textResult(error.message), isError: true };

        await supabase.from("activities").insert({
          type: "bonus", actor_name: decidedBy,
          action: kind === "award"
            ? `recorded ${payable.length} award decision(s) for ${period}`
            : `recorded ₹${total.toLocaleString("en-IN")} in bonuses for ${period}`,
        });
        invalidate(qc, [["bonus_awards"], ["activities"]]);
        canvas.clearBonusPlan();
        return textResult(
          kind === "award"
            ? `Recorded ${payable.length} award decision(s) for ${period}, as displayed. The proposal panel has cleared.`
            : `Recorded ₹${total.toLocaleString("en-IN")} across ${payable.length} people for ${period}, exactly as displayed. ` +
              `The proposal panel has cleared and the Recorded decisions table now shows them.`
        );
      },
    },
  ];
}
