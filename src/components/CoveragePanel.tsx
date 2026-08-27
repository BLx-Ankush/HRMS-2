import { AlertTriangle, ShieldCheck, Info, X, Users, CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canvas } from "@/lib/webmcp/canvas";
import { useCanvas } from "@/hooks/useCanvas";

const riskStyle = {
  high: {
    label: "High coverage risk",
    card: "border-destructive/40 bg-destructive/5",
    badge: "bg-destructive/10 text-destructive border-destructive/30",
    Icon: AlertTriangle,
  },
  medium: {
    label: "Medium coverage risk",
    card: "border-warning/40 bg-warning/5",
    badge: "bg-warning/10 text-warning border-warning/30",
    Icon: Info,
  },
  low: {
    label: "Coverage OK",
    card: "border-success/40 bg-success/5",
    badge: "bg-success/10 text-success border-success/30",
    Icon: ShieldCheck,
  },
} as const;

/**
 * Renders the agent's leave-coverage simulation onto the human's screen.
 *
 * This is the payoff of running tools inside the page: `check_leave_coverage`
 * computes the impact and the result appears here — on the same canvas the human
 * is already using to approve leave — rather than as text in a chat window.
 */
export function CoveragePanel() {
  const { coverage } = useCanvas();
  if (!coverage) return null;

  const style = riskStyle[coverage.risk];
  const { Icon } = style;
  const shortfall = coverage.requestedDays - coverage.balanceDays;

  return (
    <Card className={`shadow-soft ${style.card}`}>
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5" />
          <div>
            <CardTitle className="text-base font-display">
              Coverage simulation — {coverage.employeeName}
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {coverage.startDate} → {coverage.endDate} · {coverage.requestedDays} day(s) ·{" "}
              {coverage.department} · simulated by agent, nothing committed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${style.badge}`}>
            {style.label}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => canvas.clearCoverage()}
            aria-label="Dismiss simulation"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Paid leave balance</p>
            <p className="text-lg font-display font-bold">
              {coverage.balanceDays} <span className="text-xs font-normal text-muted-foreground">days</span>
            </p>
            <p className={`text-[11px] ${shortfall > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {shortfall > 0 ? `${shortfall} day(s) short of the request` : "Covers the request"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Team availability drop</p>
            <p className="text-lg font-display font-bold">{coverage.capacityDropPct}%</p>
            <p className="text-[11px] text-muted-foreground">
              {coverage.awayDuringWindow} of {coverage.teamSize} away in this window
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Overlapping requests</p>
            <p className="text-lg font-display font-bold">{coverage.conflicts.length}</p>
            <p className="text-[11px] text-muted-foreground">
              {coverage.conflicts.length ? "flagged below in amber" : "no clashes found"}
            </p>
          </div>
        </div>

        <p className="flex items-start gap-2 text-sm">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{coverage.note}</span>
        </p>

        {coverage.conflicts.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Teammates already away on overlapping days
            </p>
            <ul className="space-y-1">
              {coverage.conflicts.map((c) => (
                <li
                  key={c.requestId}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-background/60 px-2.5 py-1.5 text-xs"
                >
                  <span className="font-medium">{c.employeeName}</span>
                  <span className="text-muted-foreground">({c.employeeId})</span>
                  <span className="text-muted-foreground">· {c.type}</span>
                  <span className="text-muted-foreground">
                    · {c.startDate} → {c.endDate}
                  </span>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {c.overlapDays} day(s) overlap
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
