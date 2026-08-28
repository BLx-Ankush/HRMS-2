import { Fragment } from "react";
import { IndianRupee, Info, TriangleAlert, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useUpsertEmployeeSalary } from "@/hooks/hrms";
import { canvas } from "@/lib/webmcp/canvas";
import { useCanvas } from "@/hooks/useCanvas";
import type { EmployeeSalary } from "@/types/db";

const inr = (n: number) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

const delta = (from: number, to: number): string => {
  const d = Math.round(to - from);
  if (!d) return "no change";
  return `${d > 0 ? "+" : "−"}${inr(Math.abs(d))}`;
};

/**
 * Renders the agent's proposed salary breakdown onto HR's own screen.
 *
 * The proposal arrives from `propose_salary_structure` and sits here unsaved,
 * every component beside its current value and the arithmetic that produced it.
 * It becomes payroll only when a human presses Save — either here, or via
 * `commit_salary_structure`, which takes no amounts and writes precisely what is
 * drawn below. So an agent can never save a figure nobody read.
 */
export function SalaryProposalPanel() {
  const { salaryProposal: p } = useCanvas();
  const { toast } = useToast();
  const upsert = useUpsertEmployeeSalary();
  if (!p) return null;

  const earnings = p.lines.filter((l) => l.kind === "earning");
  const deductions = p.lines.filter((l) => l.kind === "deduction");
  const employer = p.lines.filter((l) => l.kind === "employer");

  const save = () => {
    const salary = { employeeId: p.employeeId } as EmployeeSalary;
    p.lines.forEach((l) => {
      (salary as any)[l.field] = Math.round(l.proposed || 0);
    });
    upsert.mutate(salary, {
      onSuccess: () => {
        toast({
          title: "Salary structure saved",
          description: `${p.employeeName} — ${inr(p.proposedGross)} gross a month, as displayed.`,
        });
        canvas.clearSalaryProposal();
      },
      onError: () =>
        toast({ title: "Could not save", description: "Please try again.", variant: "destructive" }),
    });
  };

  return (
    <Card className="border-primary/40 bg-primary/5 shadow-soft">
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div className="flex items-start gap-3">
          <IndianRupee className="mt-0.5 h-5 w-5" />
          <div>
            <CardTitle className="text-base font-display">
              Proposed structure — {p.employeeName}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">{p.employeeId}</span>
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">{p.basis}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-[10px] text-primary">
            Proposed by agent · not saved
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => canvas.clearSalaryProposal()}
            aria-label="Dismiss proposal"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Monthly gross</p>
            <p className="text-lg font-display font-bold">{inr(p.proposedGross)}</p>
            <p className="text-[11px] text-muted-foreground">
              from {inr(p.currentGross)} · {delta(p.currentGross, p.proposedGross)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Monthly take-home</p>
            <p className="text-lg font-display font-bold">{inr(p.proposedNet)}</p>
            <p className="text-[11px] text-muted-foreground">
              from {inr(p.currentNet)} · {delta(p.currentNet, p.proposedNet)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Cost to company</p>
            <p className="text-lg font-display font-bold">{inr(p.employerCost * 12)}</p>
            <p className="text-[11px] text-muted-foreground">
              a year · {inr(p.employerCost)} a month incl. employer PF
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-background/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead className="text-xs font-medium">Component</TableHead>
                <TableHead className="text-xs font-medium">Current</TableHead>
                <TableHead className="text-xs font-medium">Proposed</TableHead>
                <TableHead className="text-xs font-medium">Change</TableHead>
                <TableHead className="text-xs font-medium">How it was worked out</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { label: "Earnings", rows: earnings },
                { label: "Deductions", rows: deductions },
                { label: "Employer contribution — cost, not a deduction", rows: employer },
              ].map((group) =>
                group.rows.length === 0 ? null : (
                  <Fragment key={group.label}>
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={5}
                        className="bg-secondary/20 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        {group.label}
                      </TableCell>
                    </TableRow>
                    {group.rows.map((l) => (
                      <TableRow key={l.field}>
                        <TableCell className="text-sm font-medium">{l.label}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{inr(l.current)}</TableCell>
                        <TableCell className="text-sm font-medium">{inr(l.proposed)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {delta(l.current, l.proposed)}
                        </TableCell>
                        <TableCell className="max-w-[20rem] text-xs text-muted-foreground">{l.math}</TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                )
              )}
            </TableBody>
          </Table>
        </div>

        <p className="flex items-start gap-2 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{p.note}</span>
        </p>

        {p.warnings.length > 0 && (
          <div className="space-y-1 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
              <TriangleAlert className="h-3.5 w-3.5" />
              Check before saving
            </p>
            <ul className="ml-4 list-disc space-y-1 marker:text-warning/50">
              {p.warnings.map((w) => (
                <li key={w} className="text-[11px] leading-relaxed text-muted-foreground">{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={save} disabled={upsert.isPending || p.proposedGross <= 0}>
            {upsert.isPending ? "Saving…" : "Save this structure"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => canvas.clearSalaryProposal()}>
            Discard
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Nothing reaches payroll until you press Save. Regenerate payroll afterwards if this month
            has already been run.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
