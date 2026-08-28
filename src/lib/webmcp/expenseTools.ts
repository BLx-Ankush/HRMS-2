// Travel & expense WebMCP tools.
//
// This is the file where WebMCP's advantage is hardest to argue away. The claim
// being audited was parsed inside the browser tab from a file the human dropped
// or a bill they pasted, and was never uploaded. There is no URL, no object
// store, no OCR service — so no server-side API could read it, and no copy of
// anybody's personal spend outlives the tab.
//
// Three tools, in the order they are meant to be called:
//   * `read_expense_import`     — what is loaded in this tab
//   * `audit_expense_claim`     — apply Finance Policy §7 line by line, on screen
//   * `record_expense_decision` — commit what the human is looking at, no amounts
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { McpToolDescriptor } from "./types";
import { textResult, jsonResult } from "./registry";
import { requireApproval } from "./approval";
import { canvas } from "./canvas";
import { expenseImport } from "./importExpenses";
import {
  TRAVEL_LIMITS, auditExpenses,
  type ExpenseItem, type LinkedRequest,
} from "./expenseAudit";

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

const inr = (v: number): string => `₹${Math.round(Number(v) || 0).toLocaleString("en-IN")}`;

/**
 * Find, for each traveller in the claim, a leave or business-travel request that
 * covers the days being claimed. §7 requires conference spend to be linked to
 * one; this looks for it rather than letting the agent assert it exists.
 *
 * An approved request wins. A pending one is still returned, so the audit can
 * say "a request exists but nobody approved it" instead of "no request" — a
 * materially different conversation with the traveller.
 */
async function findLinkedRequests(
  travellerIds: string[],
  from: string,
  to: string
): Promise<Record<string, LinkedRequest | null>> {
  const links: Record<string, LinkedRequest | null> = {};
  const ids = travellerIds.filter(Boolean);
  if (!ids.length) return links;

  const { data, error } = await supabase
    .from("leave_requests")
    .select("id,employee_id,status,type,start_date,end_date")
    .in("employee_id", ids);
  if (error) throw error;

  ids.forEach((id) => {
    const overlapping = (data ?? []).filter((r: any) => {
      if (r.employee_id !== id) return false;
      const start = String(r.start_date ?? "");
      const end = String(r.end_date ?? r.start_date ?? "");
      if (!start) return false;
      // Any intersection with the claimed window counts as covering it.
      return (!to || start <= to) && (!from || end >= from);
    });
    const best =
      overlapping.find((r: any) => /approve/i.test(String(r.status ?? ""))) ?? overlapping[0];
    links[id] = best
      ? {
          requestId: String(best.id),
          status: String(best.status ?? ""),
          startDate: String(best.start_date ?? ""),
          endDate: String(best.end_date ?? best.start_date ?? ""),
        }
      : null;
  });
  return links;
}

/** Admin only: read the in-tab claim, audit it against §7, record the decision. */
export function buildExpenseAdminTools(qc: QueryClient): McpToolDescriptor[] {
  return [
    {
      name: "read_expense_import",
      title: "Read the expense claim loaded in this tab",
      annotations: { readOnlyHint: true, idempotentHint: true },
      description:
        "Read the travel claim the HR or finance user loaded onto the Expenses page — either a CSV/TSV/JSON expense export or the text of an actual bill they pasted. It was parsed inside this browser tab and never uploaded, so this tool is the only way to see it: there is no URL, file store or OCR service a server could read it from. Use it to check what was understood before auditing — which lines were found, which were skipped as totals or tender details, whether the bill is itemised, and whether anyone in the file matches nobody on the roster.",
      inputSchema: obj({
        includeLines: str("Set to 'false' to return only the summary."),
        limit: num("Return at most this many lines. Defaults to 60."),
      }),
      execute: async (args) => {
        const parsed = expenseImport.getSnapshot();
        if (!parsed)
          return jsonResult({
            loaded: false,
            hint:
              "Nothing is loaded. Ask the user to drop a CSV, TSV, JSON or .txt bill onto the import " +
              "card on the Expenses page, or paste the receipt text into it. The file is read in the " +
              "browser and never uploaded.",
          });
        const wantLines = s(args.includeLines).toLowerCase() !== "false";
        const limit = n(args.limit, 60);
        const lines = wantLines ? parsed.items.slice(0, limit > 0 ? limit : 60) : [];
        return jsonResult({
          ...expenseImport.describe(),
          lines: lines.map((i) => ({
            id: i.id, date: i.date || null, description: i.description, category: i.category,
            amount: i.amount, traveller: i.travellerName || i.travellerId || null, readFrom: i.from,
          })),
          linesReturned: lines.length,
          note:
            "Categories were read from each line's own wording, so a bill that calls beer " +
            "'refreshments' reads as food. Nothing has been audited or written yet — call " +
            "audit_expense_claim to apply Finance Policy §7 and draw the result on the user's screen.",
        });
      },
    },
    {
      name: "audit_expense_claim",
      title: "Audit the loaded claim against Finance Policy §7",
      annotations: { readOnlyHint: false, idempotentHint: true },
      description:
        "Apply the company's own travel policy to the claim loaded in this tab, line by line, and draw the marked-up result on the user's Expenses page. Every disallowed rupee carries the rule that disallowed it and the arithmetic that proves it: the daily meal cap per traveller, alcohol removed even when itemised inside a food bill, tips capped at a share of that day's pre-tax food, itemisation required above a threshold, and conference spend held unless a real approved travel request is found. It writes nothing and reimburses nobody — it puts a reviewable audit on screen. Report the held-for-review total and the published limitations honestly rather than presenting the reimbursable figure as final.",
      inputSchema: obj({
        travellerId: str("Employee ID to attribute lines that name nobody, e.g. 'EMP007'. A bill rarely names the claimant, and the daily meal cap cannot be applied without one."),
        date: str("Date to apply to lines the source never dated, YYYY-MM-DD."),
        includeLines: str("Set to 'false' to return only the totals and breaches."),
      }),
      execute: async (args) => {
        const parsed = expenseImport.getSnapshot();
        if (!parsed)
          return {
            ...textResult(
              "No claim is loaded in this tab, so there is nothing to audit. Ask the user to drop the " +
              "expense export or paste the bill onto the Expenses page first."
            ),
            isError: true,
          };
        if (!parsed.items.length)
          return {
            ...textResult(
              `Nothing usable was read from ${parsed.source}. Call read_expense_import to see which ` +
              `lines were skipped and why.`
            ),
            isError: true,
          };

        // Attribute unattributed lines, so the per-traveller daily cap can apply.
        const wanted = s(args.travellerId).toUpperCase();
        let travellerName = "";
        if (wanted) {
          const { data: prof, error } = await supabase
            .from("profiles").select("name").eq("employee_id", wanted).maybeSingle();
          if (error) throw error;
          if (!prof)
            return { ...textResult(`No employee on the roster with ID ${wanted}.`), isError: true };
          travellerName = String(prof.name ?? wanted);
        }
        const fallbackDate = s(args.date);
        const items: ExpenseItem[] = parsed.items.map((i) => ({
          ...i,
          date: i.date || fallbackDate,
          travellerId: i.travellerId || wanted,
          travellerName: i.travellerName || travellerName,
        }));
        // Keep the loaded claim and the audit telling the same story.
        expenseImport.set({ ...parsed, items });

        const dates = items.map((i) => i.date).filter(Boolean).sort();
        const travellerIds = Array.from(new Set(items.map((i) => i.travellerId).filter(Boolean)));
        const linkedRequests = await findLinkedRequests(
          travellerIds,
          dates[0] ?? "",
          dates[dates.length - 1] ?? ""
        );

        const audit = auditExpenses({
          source: parsed.source,
          itemised: parsed.itemised,
          items,
          linkedRequests,
        });
        canvas.showExpenseAudit(audit);

        const wantLines = s(args.includeLines).toLowerCase() !== "false";
        return jsonResult({
          drawnOnScreen: true,
          savedToDatabase: false,
          source: audit.source,
          itemisedSource: audit.itemised,
          policy: audit.policyCitation,
          travellers: audit.travellers,
          claimedTotal: audit.claimedTotal,
          reimbursableTotal: audit.reimbursableTotal,
          disallowedTotal: audit.disallowedTotal,
          heldForReviewTotal: audit.heldForReviewTotal,
          breaches: audit.breaches,
          dailyMealCaps: audit.dayCaps,
          needsHumanJudgment: audit.needsReview,
          ...(wantLines
            ? {
                lines: audit.items.map((i) => ({
                  id: i.id, date: i.date || null, description: i.description, category: i.category,
                  traveller: i.travellerName || i.travellerId || "unidentified",
                  claimed: i.amount, reimbursable: i.allowed, removed: i.disallowed,
                  verdict: i.verdict, rule: i.rule, workedOut: i.math,
                })),
              }
            : {}),
          unmatchedIdentitiesInFile: parsed.unmatched,
          skippedLines: parsed.skipped,
          limits: TRAVEL_LIMITS,
          limitations: audit.disclosure,
          nextStep:
            "The marked-up audit is on the user's screen. Walk them through what was removed and why, " +
            "say plainly what is held for review, then call record_expense_decision if they accept it — " +
            "that tool takes no figures, it commits what is displayed.",
        });
      },
    },
    {
      name: "record_expense_decision",
      title: "Record the expense audit currently on screen",
      annotations: { readOnlyHint: false, idempotentHint: false },
      description:
        "Commit the expense decision the user is looking at right now. It takes no amounts as arguments — it reads the audited claim held in this page's live state, so the reimbursable figure that goes on the record is provably the one the human read on their own screen. Requires in-page confirmation. Call audit_expense_claim first; there is nothing to record until an audit is displayed. Once recorded, the parsed claim is discarded from the tab.",
      inputSchema: obj({
        decision: {
          type: "string",
          description: "'approve' to record the reimbursable total as agreed, or 'return' to record that the claim went back to the traveller.",
          enum: ["approve", "return"],
        },
        reason: str("One line for the record, e.g. 'Bengaluru client visit, March'."),
        decidedBy: str("Name to record as the approver. Defaults to the signed-in HR user."),
      }),
      execute: async (args) => {
        const held = canvas.getSnapshot().expenseAudit;
        if (!held)
          return {
            ...textResult(
              "No expense audit is on screen, so there is nothing to record. Call audit_expense_claim " +
              "first so the human can see what they would be approving."
            ),
            isError: true,
          };
        const audit = held.audit;
        const decision = s(args.decision) === "return" ? "return" : "approve";
        const who =
          audit.travellers.map((t) => t.travellerName).join(", ") || "unidentified traveller";
        const decidedBy = s(args.decidedBy) || "HR";
        const reason = s(args.reason) || `Travel claim — ${audit.source}`;

        const ok = await requireApproval({
          title: decision === "approve" ? "Record expense approval" : "Return expense claim",
          summary:
            decision === "approve"
              ? `Approve ${inr(audit.reimbursableTotal)} of ${inr(audit.claimedTotal)} claimed by ${who}`
              : `Return the ${inr(audit.claimedTotal)} claim from ${who} to the traveller`,
          details: {
            Claim: audit.source,
            Traveller: who,
            Claimed: inr(audit.claimedTotal),
            Reimbursable: inr(audit.reimbursableTotal),
            "Removed by policy": inr(audit.disallowedTotal),
            ...(audit.heldForReviewTotal > 0
              ? { "Held for review": `${inr(audit.heldForReviewTotal)} — not included in the reimbursable figure` }
              : {}),
            "Itemised source": audit.itemised ? "yes" : "no — §7 requires one above ₹5,000",
            "Rules applied": audit.breaches.length
              ? audit.breaches.map((b) => `${b.rule} (${inr(b.amount)})`).join(" · ")
              : "no breaches found",
            Policy: audit.policyCitation,
            Note: "This records the decision on the activity feed. It does not move money, and nothing about the claim is stored beyond this line.",
          },
          confirmLabel: decision === "approve" ? "Record approval" : "Record return",
          destructive: decision === "return",
        });
        if (!ok) return textResult("Cancelled — nothing was recorded and the audit is still on screen.");

        const action =
          decision === "approve"
            ? `approved ${inr(audit.reimbursableTotal)} of ${inr(audit.claimedTotal)} claimed by ${who} ` +
              `(${inr(audit.disallowedTotal)} removed under ${audit.policyCitation}) — ${reason}`
            : `returned a ${inr(audit.claimedTotal)} travel claim from ${who} — ${reason}`;
        const { error } = await supabase
          .from("activities")
          .insert({ type: "expense", actor_name: decidedBy, action });
        if (error) return { ...textResult(error.message), isError: true };
        invalidate(qc, [["activities"], ["stats"]]);

        // The claim leaves the tab with the decision. Nothing about someone's
        // restaurant order needs to outlive the moment it was judged.
        canvas.clearExpenseAudit();
        expenseImport.clear();

        return textResult(
          decision === "approve"
            ? `Recorded: ${inr(audit.reimbursableTotal)} reimbursable of ${inr(audit.claimedTotal)} claimed by ` +
              `${who}, exactly as displayed — ${inr(audit.disallowedTotal)} removed under ${audit.policyCitation}` +
              (audit.heldForReviewTotal > 0
                ? `, and ${inr(audit.heldForReviewTotal)} still held for review`
                : "") +
              `. The audit panel has cleared and the parsed claim is gone from this tab.`
            : `Recorded: the ${inr(audit.claimedTotal)} claim from ${who} was returned. The audit panel ` +
              `has cleared and the parsed claim is gone from this tab.`
        );
      },
    },




  ];
}
