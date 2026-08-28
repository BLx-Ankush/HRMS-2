import { useEffect, useSyncExternalStore } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useEmployees } from "@/hooks/hrms";
import { useCanvas } from "@/hooks/useCanvas";
import { canvas } from "@/lib/webmcp/canvas";
import { expenseImport } from "@/lib/webmcp/importExpenses";
import { ExpenseImportPanel } from "@/components/ExpenseImportPanel";
import { ExpenseAuditPanel } from "@/components/ExpenseAuditPanel";
import { TRAVEL_LIMITS } from "@/lib/webmcp/expenseAudit";

const inr = (v: number): string => `₹${Math.round(Number(v) || 0).toLocaleString("en-IN")}`;

/**
 * Travel & expenses — the page that only exists because of the browser.
 *
 * A claim is dropped or pasted here, parsed by this tab, audited against Finance
 * Policy §7 line by line, and decided by a human. Nothing is uploaded: there is
 * no URL for the bill and no OCR service holding a copy of somebody's dinner.
 * That is exactly why the three expense tools have no REST equivalent — the data
 * they reason over exists only on this screen.
 */
export default function Expenses() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: employees = [] } = useEmployees();
  const { expenseAudit } = useCanvas();
  const parsed = useSyncExternalStore(
    expenseImport.subscribe,
    expenseImport.getSnapshot,
    expenseImport.getSnapshot
  );

  // Primitives only in the deps below — putting the parse or the audit object in
  // there loops publish → notify → render, which this project has been bitten by.
  const loadedSource = parsed?.source ?? "";
  const loadedLines = parsed?.items.length ?? 0;
  const itemised = !!parsed?.itemised;
  const auditedSource = expenseAudit?.audit.source ?? "";
  const claimed = expenseAudit?.audit.claimedTotal ?? 0;
  const reimbursable = expenseAudit?.audit.reimbursableTotal ?? 0;
  const removed = expenseAudit?.audit.disallowedTotal ?? 0;
  const held = expenseAudit?.audit.heldForReviewTotal ?? 0;
  const breaches = expenseAudit?.audit.breaches.length ?? 0;

  useEffect(() => {
    canvas.publishContext({
      page: "Travel & Expenses",
      restricted: !isAdmin,
      claimLoadedInTab: loadedSource || null,
      linesLoaded: loadedLines,
      itemisedSource: itemised,
      neverUploaded: true,
      auditOnScreen: auditedSource
        ? {
            source: auditedSource,
            claimedTotal: claimed,
            reimbursableTotal: reimbursable,
            disallowedTotal: removed,
            heldForReviewTotal: held,
            breaches,
            recorded: false,
          }
        : null,
      rosterSelectable: employees.length,
    });
  }, [
    isAdmin, loadedSource, loadedLines, itemised, auditedSource,
    claimed, reimbursable, removed, held, breaches, employees.length,
  ]);

  if (!isAdmin) {
    return (
      <DashboardLayout title="Travel & Expenses">
        <Card className="border-border shadow-soft">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Submit travel bills to HR — reimbursement decisions are made by finance.
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Travel & Expenses">
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-secondary/20 px-4 py-3">
          <p className="text-sm font-medium">Finance Policy §7 — Travel, Meals &amp; Entertainment</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Meals up to {inr(TRAVEL_LIMITS.mealPerDayPerTraveller)} per traveller per day · alcohol never
            reimbursable, including itemised inside a meal bill · tips up to{" "}
            {Math.round(TRAVEL_LIMITS.tipPctOfPreTaxFood * 100)}% of that day's pre-tax food · any single
            receipt above {inr(TRAVEL_LIMITS.itemisationRequiredAbove)} needs an itemised bill, not a card
            slip · conference spend must link to an approved travel request.
          </p>
        </div>

        <ExpenseAuditPanel />
        <ExpenseImportPanel roster={employees} />
      </div>
    </DashboardLayout>
  );
}
