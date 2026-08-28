import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Scale, ShieldAlert, X, CheckCircle2, Undo2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { canvas } from "@/lib/webmcp/canvas";
import { useCanvas } from "@/hooks/useCanvas";
import { expenseImport } from "@/lib/webmcp/importExpenses";
import type { Verdict } from "@/lib/webmcp/expenseAudit";

const inr = (v: number): string => `₹${Math.round(Number(v) || 0).toLocaleString("en-IN")}`;

const VERDICT_STYLE: Record<Verdict, string> = {
  allowed: "border-success/20 bg-success/10 text-success",
  capped: "border-warning/20 bg-warning/10 text-warning",
  disallowed: "border-destructive/20 bg-destructive/10 text-destructive",
  review: "border-primary/20 bg-primary/10 text-primary",
};

/**
 * The audited claim, on the human's own screen.
 *
 * Every removed rupee shows the rule that removed it and the arithmetic behind
 * it, so nobody has to trust the audit to check it. What is recorded is what is
 * displayed here: `record_expense_decision` takes no figures at all, and the two
 * buttons below commit the same numbers the agent would.
 */
export function ExpenseAuditPanel() {
  const { expenseAudit } = useCanvas();
  const [saving, setSaving] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  if (!expenseAudit) return null;
  const audit = expenseAudit.audit;
  const who = audit.travellers.map((t) => t.travellerName).join(", ") || "unidentified traveller";

  const record = async (decision: "approve" | "return") => {
    setSaving(decision);
    const action =
      decision === "approve"
        ? `approved ${inr(audit.reimbursableTotal)} of ${inr(audit.claimedTotal)} claimed by ${who} ` +
          `(${inr(audit.disallowedTotal)} removed under ${audit.policyCitation}) — ${audit.source}`
        : `returned a ${inr(audit.claimedTotal)} travel claim from ${who} — ${audit.source}`;
    const { error } = await supabase
      .from("activities")
      .insert({ type: "expense", actor_name: "HR", action });
    setSaving("");
    if (error) {
      toast({ title: "Could not record the decision", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["activities"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    toast({
      title: decision === "approve" ? "Reimbursement recorded" : "Claim returned",
      description:
        decision === "approve"
          ? `${inr(audit.reimbursableTotal)} for ${who}, exactly as displayed.`
          : `${who} has been asked for a corrected claim.`,
    });
    canvas.clearExpenseAudit();
    expenseImport.clear();
  };

  return (
    <Card className="border-primary/20 shadow-soft">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Scale className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-display">
                Audited claim — {audit.source}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {who} · {audit.items.length} line(s) · {audit.policyCitation} · nothing reimbursed yet
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!audit.itemised && (
              <Badge variant="outline" className="border-warning/20 bg-warning/10 text-[10px] text-warning">
                not itemised
              </Badge>
            )}
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => canvas.clearExpenseAudit()}>
              <X className="mr-1 h-3 w-3" /> Discard
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Claimed", value: audit.claimedTotal, tone: "" },
            { label: "Reimbursable", value: audit.reimbursableTotal, tone: "text-success" },
            { label: "Removed by policy", value: audit.disallowedTotal, tone: "text-destructive" },
            { label: "Held for review", value: audit.heldForReviewTotal, tone: "text-primary" },
          ].map((tile) => (
            <div key={tile.label} className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">{tile.label}</p>
              <p className={`text-lg font-display ${tile.tone}`}>{inr(tile.value)}</p>
            </div>
          ))}
        </div>

        {audit.breaches.length > 0 && (
          <div className="space-y-2 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
              <ShieldAlert className="h-3.5 w-3.5" /> {audit.breaches.length} rule(s) breached
            </p>
            {audit.breaches.map((b) => (
              <div key={b.rule} className="text-xs">
                <p className="font-medium">{b.rule}</p>
                <p className="text-muted-foreground">{b.detail} — {inr(b.amount)}</p>
              </div>
            ))}
          </div>
        )}

        {audit.needsReview.length > 0 && (
          <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
            <p className="text-xs font-medium text-primary">Needs your judgment</p>
            {audit.needsReview.map((r) => (
              <p key={r} className="text-xs text-muted-foreground">{r}</p>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead className="text-xs font-medium">Line</TableHead>
                <TableHead className="text-xs font-medium">Date</TableHead>
                <TableHead className="text-right text-xs font-medium">Claimed</TableHead>
                <TableHead className="text-right text-xs font-medium">Reimbursable</TableHead>
                <TableHead className="text-xs font-medium">Verdict</TableHead>
                <TableHead className="text-xs font-medium">Rule, and how it was worked out</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.items.map((i) => (
                <TableRow
                  key={i.id}
                  className={i.verdict === "allowed" ? "" : "bg-warning/5"}
                >
                  <TableCell className="max-w-[16rem] text-xs">
                    <span className="block truncate font-medium">{i.description}</span>
                    <span className="text-[11px] capitalize text-muted-foreground">
                      {i.category} · {i.travellerName || "no traveller"} · {i.from}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{i.date || "—"}</TableCell>
                  <TableCell className="text-right text-xs">{inr(i.amount)}</TableCell>
                  <TableCell className="text-right text-xs">
                    {i.verdict === "review" ? "—" : inr(i.allowed)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${VERDICT_STYLE[i.verdict]}`}>
                      {i.verdict}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[24rem] text-[11px] text-muted-foreground">
                    <span className="block font-medium text-foreground">{i.rule}</span>
                    {i.math}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {audit.dayCaps.length > 0 && (
          <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs">
            <p className="font-medium">Daily meal cap, per traveller</p>
            <div className="mt-1 space-y-0.5 text-muted-foreground">
              {audit.dayCaps.map((d) => (
                <p key={d.key}>
                  {d.travellerName} · {d.date}: food {inr(d.mealClaimed)} claimed,{" "}
                  {inr(d.mealAllowed)} within the {inr(d.cap)} cap · tip allowance {inr(d.tipAllowance)}{" "}
                  (10% of {inr(d.preTaxFood)}), {inr(d.tipClaimed)} claimed
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1 text-[11px] text-muted-foreground">
          {audit.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>

        <details className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium">
            What this audit cannot see ({audit.disclosure.length})
          </summary>
          <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
            {audit.disclosure.map((d) => (
              <li key={d}>· {d}</li>
            ))}
          </ul>
        </details>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => record("approve")} disabled={!!saving}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            {saving === "approve" ? "Recording…" : `Approve ${inr(audit.reimbursableTotal)}`}
          </Button>
          <Button size="sm" variant="outline" onClick={() => record("return")} disabled={!!saving}>
            <Undo2 className="mr-1.5 h-3.5 w-3.5" />
            {saving === "return" ? "Recording…" : "Return to traveller"}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Recording writes one line to the activity feed. It does not move money, and the parsed claim
            leaves this tab with the decision.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
