import { Coins, Trophy, X, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useSaveBonusAwards } from "@/hooks/hrms";
import { canvas } from "@/lib/webmcp/canvas";
import { useCanvas } from "@/hooks/useCanvas";

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

/**
 * Renders the agent's proposed bonus split (or award shortlist) onto HR's own
 * screen.
 *
 * The proposal arrives from a WebMCP tool call and is drawn here, unsaved. It
 * becomes a decision only when the human presses Record — the agent can compute
 * and argue, but it cannot pay anybody. Everything shown is traceable back to
 * verified contribution rows in the table below.
 */
export function BonusPlanPanel() {
  const { bonusPlan } = useCanvas();
  const { user } = useAuth();
  const { toast } = useToast();
  const saveAwards = useSaveBonusAwards();
  if (!bonusPlan) return null;

  const isAward = bonusPlan.kind === "shortlist";
  const Icon = isAward ? Trophy : Coins;
  const total = bonusPlan.lines.reduce((n, l) => n + l.amount, 0);

  const record = () => {
    if (!bonusPlan.lines.length) return;
    saveAwards.mutate(
      bonusPlan.lines.map((l, i) => ({
        employeeId: l.employeeId,
        employeeName: l.employeeName,
        period: bonusPlan.window,
        amount: l.amount,
        score: l.score,
        rank: i + 1,
        kind: isAward ? ("award" as const) : ("bonus" as const),
        reason: l.reason,
        decidedBy: user?.name ?? "HR",
      })),
      {
        onSuccess: () => {
          toast({
            title: isAward ? "Award recorded" : "Bonuses recorded",
            description: `${bonusPlan.lines.length} decision(s) saved against ${bonusPlan.window}.`,
          });
          canvas.clearBonusPlan();
        },
        onError: () =>
          toast({ title: "Could not save", description: "Please try again.", variant: "destructive" }),
      }
    );
  };

  return (
    <Card className="border-primary/40 bg-primary/5 shadow-soft">
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5" />
          <div>
            <CardTitle className="text-base font-display">{bonusPlan.title}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {bonusPlan.window} · {bonusPlan.method}
            </p>
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
            onClick={() => canvas.clearBonusPlan()}
            aria-label="Dismiss proposal"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isAward && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Pool</p>
              <p className="text-lg font-display font-bold">{inr(bonusPlan.pool)}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Allocated</p>
              <p className="text-lg font-display font-bold">{inr(total)}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">People</p>
              <p className="text-lg font-display font-bold">{bonusPlan.lines.length}</p>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border overflow-hidden bg-background/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead className="text-xs font-medium">#</TableHead>
                <TableHead className="text-xs font-medium">Employee</TableHead>
                <TableHead className="text-xs font-medium">Score</TableHead>
                {!isAward && <TableHead className="text-xs font-medium">Share</TableHead>}
                {!isAward && <TableHead className="text-xs font-medium">Amount</TableHead>}
                <TableHead className="text-xs font-medium">Basis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bonusPlan.lines.map((l, i) => (
                <TableRow key={l.employeeId}>
                  <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {l.employeeName}
                    <span className="ml-1.5 text-xs text-muted-foreground">{l.employeeId}</span>
                  </TableCell>
                  <TableCell className="text-sm">{l.score}</TableCell>
                  {!isAward && <TableCell className="text-sm">{l.sharePct}%</TableCell>}
                  {!isAward && <TableCell className="text-sm font-medium">{inr(l.amount)}</TableCell>}
                  <TableCell className="max-w-[22rem] text-xs text-muted-foreground">{l.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="flex items-start gap-2 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{bonusPlan.note}</span>
        </p>

        {bonusPlan.excluded.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              Left out of this split, and why — an omission should be a visible decision
            </p>
            <ul className="space-y-1">
              {bonusPlan.excluded.map((e) => (
                <li key={e.employeeName} className="rounded-md bg-background/60 px-2.5 py-1.5 text-xs">
                  <span className="font-medium">{e.employeeName}</span>
                  <span className="text-muted-foreground"> — {e.why}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={record} disabled={saveAwards.isPending || !bonusPlan.lines.length}>
            {saveAwards.isPending ? "Recording…" : isAward ? "Record award" : "Record these bonuses"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => canvas.clearBonusPlan()}>
            Discard
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Nothing is paid or stored until you press Record.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
