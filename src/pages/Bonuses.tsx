import { Fragment, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Award, Bot, Calculator, Check, ChevronDown, ChevronRight, Info, Plus, ShieldAlert, X,
} from "lucide-react";
import {
  useBonusAwards, useContributions, useEmployees, useLogContributions, useVerifyContribution,
} from "@/hooks/hrms";
import {
  CONTRIBUTION_DISCLOSURE, IMPACT_WEIGHTS, TYPE_WEIGHTS, WEIGHT_NOTES, scoreContributions,
} from "@/lib/webmcp/contributionScore";
import { BonusPlanPanel } from "@/components/BonusPlanPanel";
import { ContributionImportPanel } from "@/components/ContributionImportPanel";
import { useCanvas } from "@/hooks/useCanvas";
import { canvas } from "@/lib/webmcp/canvas";
import type { ContributionType } from "@/types/db";

const statusConfig: Record<string, { label: string; className: string }> = {
  claimed: { label: "Awaiting review", className: "bg-warning/10 text-warning border-warning/20" },
  verified: { label: "Verified", className: "bg-success/10 text-success border-success/20" },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

const TYPES: ContributionType[] = [
  "delivery", "initiative", "fix", "improvement", "mentoring", "documentation", "support",
];
const IMPACTS = ["low", "medium", "high"] as const;
const emptyForm = { title: "", detail: "", type: "delivery", impact: "medium", occurredOn: "", link: "" };
const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

/**
 * The published weights and caveats, kept behind a single icon.
 *
 * This is reference material, not page content: it has to be one click away
 * (an unexplained score is not auditable) without turning the bottom of the
 * screen into a wall of policy text. The agent gets the same model through the
 * `get_scoring_model` tool, so the two can never drift apart.
 */
function ScoringModelDialog() {
  return (
    <Dialog>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="How the score is calculated, and what it cannot see"
              >
                <Calculator className="h-4 w-4" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            How the score is calculated, and what it cannot see
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-display">
            How the score is calculated, and what it cannot see
          </DialogTitle>
          <DialogDescription className="text-xs">
            points = type weight × impact weight, summed over verified evidence only
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(IMPACT_WEIGHTS).map(([impact, w]) => (
              <Badge key={impact} variant="outline" className="text-[10px] capitalize">
                {impact} impact × {w}
              </Badge>
            ))}
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {TYPES.map((t) => (
              <div key={t} className="rounded-md bg-secondary/30 px-2.5 py-1.5">
                <p className="text-xs font-medium capitalize">
                  {t} <span className="text-muted-foreground">× {TYPE_WEIGHTS[t]}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">{WEIGHT_NOTES[t]}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
              <ShieldAlert className="h-3.5 w-3.5" /> This score is auditable, not unbiased
            </p>
            <ul className="ml-4 list-disc space-y-1 marker:text-warning/50">
              {CONTRIBUTION_DISCLOSURE.map((line) => (
                <li key={line} className="text-[11px] leading-relaxed text-muted-foreground">{line}</li>
              ))}
            </ul>
          </div>
          <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            An AI agent reads this same model through the{" "}
            <code className="rounded bg-secondary px-1 py-0.5">get_scoring_model</code> tool — these
            weights, the reason for each one, and the caveats above — so every point it quotes traces
            back to this policy rather than to a judgment of its own.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Bonuses() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  const { data: contributions = [], isLoading } = useContributions();
  const { data: employees = [] } = useEmployees();
  const { data: awards = [] } = useBonusAwards();
  const logContribution = useLogContributions();
  const verifyContribution = useVerifyContribution();

  const { focusContributorId, highlightContributionIds } = useCanvas();
  const flagged = new Set(highlightContributionIds);

  const [windowDays, setWindowDays] = useState(90);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const board = useMemo(
    () => scoreContributions(contributions, { windowDays }),
    [contributions, windowDays]
  );

  const mine = contributions.filter((c) => c.employeeId === user?.employeeId);
  const myScore = board.employees.find((e) => e.employeeId === user?.employeeId);
  const myAwards = awards.filter((a) => a.employeeId === user?.employeeId);
  const pendingClaims = contributions.filter((c) => c.status === "claimed");

  // The agent asked us to focus a contributor: open their evidence drawer.
  useEffect(() => {
    if (focusContributorId) setExpanded(focusContributorId);
  }, [focusContributorId]);

  // Publish what is on screen so `get_page_context` can answer truthfully.
  // Deps are primitives only — passing the arrays would loop forever.
  const rankKey = board.employees.map((e) => e.employeeId).join(",");
  useEffect(() => {
    canvas.publishContext({
      screen: isAdmin ? "bonus-board" : "my-contributions",
      window: `${board.window.from} → ${board.window.to}`,
      contributors: board.employees.length,
      verifiedRows: board.totalVerified,
      pendingClaims: board.totalPending,
      totalPoints: board.totalPoints,
      leaderboard: board.employees.slice(0, 5).map((e) => ({
        rank: e.rank, employeeId: e.employeeId, employeeName: e.employeeName,
        department: e.department, score: e.score, pendingPoints: e.pendingPoints,
      })),
      expandedContributorId: expanded,
      myScore: myScore ? { score: myScore.score, rank: myScore.rank } : null,
      awardsRecorded: awards.length,
      disclosureVisible: true,
    });
  }, [rankKey, windowDays, isAdmin, expanded, awards.length, board.totalPending]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitOwn = () => {
    if (!form.title.trim()) {
      toast({ title: "Missing title", description: "Describe what you did.", variant: "destructive" });
      return;
    }
    if (!user) return;
    logContribution.mutate(
      {
        profileId: user.id,
        employeeId: user.employeeId,
        employeeName: user.name,
        department: user.department ?? "",
        title: form.title.trim(),
        detail: form.detail.trim(),
        type: form.type as ContributionType,
        impact: form.impact as "low" | "medium" | "high",
        occurredOn: form.occurredOn || new Date().toISOString().slice(0, 10),
        link: form.link.trim(),
        source: "self",
        status: "claimed",
      },
      {
        onSuccess: () => {
          setForm(emptyForm);
          setIsDialogOpen(false);
          toast({
            title: "Contribution logged",
            description: "It counts towards your score once HR verifies it.",
          });
        },
        onError: () =>
          toast({ title: "Could not log it", description: "Please try again.", variant: "destructive" }),
      }
    );
  };

  const decide = (id: string, status: "verified" | "rejected") => {
    verifyContribution.mutate(
      { id, status, verifiedBy: user?.name ?? "HR" },
      {
        onSuccess: () =>
          toast({
            title: status === "verified" ? "Contribution verified" : "Contribution rejected",
            description:
              status === "verified"
                ? "It now counts towards the contribution score."
                : "It will not count towards any score.",
          }),
      }
    );
  };

  const LogDialog = (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> Log contribution
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log a contribution</DialogTitle>
          <DialogDescription>
            Attach a link where you can — evidence is what makes a claim checkable, and unverified
            claims score nothing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-title">What did you do?</Label>
            <Input
              id="c-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Rebuilt the payroll generation pipeline"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-detail">Detail</Label>
            <Textarea
              id="c-detail"
              value={form.detail}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
              placeholder="Cut the month-end run from 40 minutes to under 2."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kind of work</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t} (× {TYPE_WEIGHTS[t]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Impact</Label>
              <Select value={form.impact} onValueChange={(v) => setForm({ ...form, impact: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IMPACTS.map((i) => (
                    <SelectItem key={i} value={i} className="capitalize">
                      {i} (× {IMPACT_WEIGHTS[i]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-date">When</Label>
              <Input
                id="c-date"
                type="date"
                value={form.occurredOn}
                onChange={(e) => setForm({ ...form, occurredOn: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-link">Evidence link</Label>
              <Input
                id="c-link"
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
                placeholder="https://github.com/…/pull/128"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
          <Button onClick={submitOwn} disabled={logContribution.isPending}>
            {logContribution.isPending ? "Logging…" : "Log contribution"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ---------- Employee view ----------
  if (!isAdmin) {
    return (
      <DashboardLayout title="My Contributions">
        <div className="space-y-6">
          <Card className="border-border shadow-soft">
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  My contribution score
                </CardTitle>
                <CardDescription className="text-xs">
                  {board.window.from} → {board.window.to} · verified evidence only
                </CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <ScoringModelDialog />
                {LogDialog}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                <p className="text-3xl font-display font-bold text-foreground">
                  {myScore?.score ?? 0}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">pts</span>
                </p>
                <div className="text-xs text-muted-foreground">
                  <p>{myScore?.verifiedCount ?? 0} verified · {myScore?.pendingCount ?? 0} awaiting review</p>
                  <p>{myScore?.highImpactCount ?? 0} high-impact · {myScore?.breadth ?? 0} kind(s) of work</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Against the strongest contributor in {myScore?.department || "the company"}</span>
                  <span>{myScore?.deptBarPct ?? 0}%</span>
                </div>
                <Progress value={myScore?.deptBarPct ?? 0} className="h-2" />
              </div>
              {(myScore?.pendingPoints ?? 0) > 0 && (
                <p className="rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
                  {myScore?.pendingPoints} point(s) are sitting behind {myScore?.pendingCount} unverified
                  claim(s). They do not count until HR reviews them.
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">My evidence</CardTitle>
              <CardDescription className="text-xs">
                Everything I have logged, and where each item stands
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/30">
                      <TableHead className="text-xs font-medium">What</TableHead>
                      <TableHead className="text-xs font-medium">Kind</TableHead>
                      <TableHead className="text-xs font-medium">Impact</TableHead>
                      <TableHead className="text-xs font-medium">When</TableHead>
                      <TableHead className="text-xs font-medium">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                          Loading…
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoading && mine.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                          Nothing logged yet. Support and mentoring work is the easiest to forget — log it.
                        </TableCell>
                      </TableRow>
                    )}
                    {mine.map((c) => (
                      <TableRow key={c.id} className={flagged.has(c.id) ? "bg-warning/5" : ""}>
                        <TableCell className="max-w-[22rem] text-sm">
                          <p className="font-medium">{c.title}</p>
                          {c.detail && <p className="text-xs text-muted-foreground">{c.detail}</p>}
                          {c.link && (
                            <a
                              href={c.link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary underline"
                            >
                              evidence
                            </a>
                          )}
                        </TableCell>
                        <TableCell className="text-xs capitalize">{c.type}</TableCell>
                        <TableCell className="text-xs capitalize">{c.impact}</TableCell>
                        <TableCell className="text-xs">{c.occurredOn}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${statusConfig[c.status]?.className}`}>
                            {statusConfig[c.status]?.label ?? c.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {myAwards.length > 0 && (
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Recorded for me
                </CardTitle>
                <CardDescription className="text-xs">
                  Decisions HR has committed, and the evidence each one cites
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary/30">
                        <TableHead className="text-xs font-medium">Period</TableHead>
                        <TableHead className="text-xs font-medium">Kind</TableHead>
                        <TableHead className="text-xs font-medium">Amount</TableHead>
                        <TableHead className="text-xs font-medium">Basis</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myAwards.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs">{a.period}</TableCell>
                          <TableCell className="text-xs capitalize">{a.kind}</TableCell>
                          <TableCell className="text-sm font-medium">
                            {a.kind === "award" ? "—" : inr(a.amount)}
                          </TableCell>
                          <TableCell className="max-w-[22rem] text-xs text-muted-foreground">
                            {a.reason}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ---------- Admin view ----------
  const totalAwarded = awards.reduce((n, a) => n + a.amount, 0);

  return (
    <DashboardLayout title="Employee Bonuses">
      <div className="space-y-6">
        {/* Agent-rendered bonus proposal (appears when a tool runs) */}
        <BonusPlanPanel />

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-border shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Contributors</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-display font-bold text-foreground">{board.employees.length}</p>
              <p className="text-xs text-muted-foreground">with evidence in the window</p>
            </CardContent>
          </Card>
          <Card className="border-border shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Verified points</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-display font-bold text-foreground">{board.totalPoints}</p>
              <p className="text-xs text-muted-foreground">{board.totalVerified} verified item(s)</p>
            </CardContent>
          </Card>
          <Card className="border-border shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Awaiting review</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-display font-bold text-foreground">{board.totalPending}</p>
              <p className="text-xs text-muted-foreground">claims scoring zero until verified</p>
            </CardContent>
          </Card>
          <Card className="border-border shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Recorded</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-display font-bold text-foreground">{inr(totalAwarded)}</p>
              <p className="text-xs text-muted-foreground">{awards.length} decision(s) on file</p>
            </CardContent>
          </Card>
        </div>
        <Card className="border-border shadow-soft">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
            <div>
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Award className="h-4 w-4" /> Contribution board
              </CardTitle>
              <CardDescription className="text-xs">
                {board.window.from} → {board.window.to} · ranked on verified evidence, not attendance or tenure
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5">
              <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 180 days</SelectItem>
                  <SelectItem value="365">Last 365 days</SelectItem>
                </SelectContent>
              </Select>
              <ScoringModelDialog />
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/30">
                    <TableHead className="text-xs font-medium w-8"></TableHead>
                    <TableHead className="text-xs font-medium">#</TableHead>
                    <TableHead className="text-xs font-medium">Employee</TableHead>
                    <TableHead className="text-xs font-medium">Department</TableHead>
                    <TableHead className="text-xs font-medium w-[220px]">Contribution</TableHead>
                    <TableHead className="text-xs font-medium">Score</TableHead>
                    <TableHead className="text-xs font-medium">Evidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && board.employees.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                        No contribution evidence in this window. Widen the window, or import a work export below.
                      </TableCell>
                    </TableRow>
                  )}
                  {board.employees.map((e) => (
                    <Fragment key={e.employeeId}>
                      <TableRow
                        className={`cursor-pointer ${
                          focusContributorId === e.employeeId ? "bg-primary/5" : ""
                        }`}
                        onClick={() => setExpanded(expanded === e.employeeId ? null : e.employeeId)}
                      >
                        <TableCell className="text-muted-foreground">
                          {expanded === e.employeeId
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{e.rank}</TableCell>
                        <TableCell className="text-sm">
                          <p className="font-medium">{e.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{e.employeeId}</p>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.department || "—"}</TableCell>
                        <TableCell>
                          <Progress value={e.barPct} className="h-2" />
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {e.barPct}% of the top scorer · #{e.deptRank} in {e.department || "—"}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {e.score}
                          {e.pendingPoints > 0 && (
                            <span className="ml-1 text-[11px] font-normal text-warning">
                              +{e.pendingPoints} pending
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {e.verifiedCount} verified · {e.highImpactCount} high · {e.breadth} kind(s)
                        </TableCell>
                      </TableRow>
                      {expanded === e.employeeId && (
                        <TableRow className="bg-secondary/20 hover:bg-secondary/20">
                          <TableCell colSpan={7} className="py-3">
                            <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                              Every point traced to the row that produced it
                            </p>
                            {e.lines.length === 0 && (
                              <p className="text-xs text-muted-foreground">
                                No verified rows — this score is zero because nothing has been reviewed yet.
                              </p>
                            )}
                            <ul className="space-y-1">
                              {e.lines.map((l) => (
                                <li
                                  key={l.contributionId}
                                  className={`flex flex-wrap items-center gap-x-2 rounded-md px-2.5 py-1.5 text-xs ${
                                    flagged.has(l.contributionId) ? "bg-warning/10" : "bg-background/60"
                                  }`}
                                >
                                  <span className="font-medium">{l.title}</span>
                                  <span className="text-muted-foreground">· {l.occurredOn}</span>
                                  <span className="text-muted-foreground">· {l.math}</span>
                                  <Badge variant="outline" className="ml-auto text-[10px]">
                                    {l.points} pts
                                  </Badge>
                                </li>
                              ))}
                            </ul>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                              {Object.entries(e.mix).map(([type, pts]) => (
                                <Badge key={type} variant="outline" className="text-[10px] capitalize">
                                  {type}: {pts}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display">Claims awaiting your review</CardTitle>
            <CardDescription className="text-xs">
              Verification is the step that makes points count — a backlog here depresses real scores
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/30">
                    <TableHead className="text-xs font-medium">Employee</TableHead>
                    <TableHead className="text-xs font-medium">What</TableHead>
                    <TableHead className="text-xs font-medium">Kind</TableHead>
                    <TableHead className="text-xs font-medium">Impact</TableHead>
                    <TableHead className="text-xs font-medium">Source</TableHead>
                    <TableHead className="text-xs font-medium text-right">Decide</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingClaims.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                        Nothing waiting. Every logged claim has been reviewed.
                      </TableCell>
                    </TableRow>
                  )}
                  {pendingClaims.map((c) => (
                    <TableRow key={c.id} className={flagged.has(c.id) ? "bg-warning/5" : ""}>
                      <TableCell className="text-sm">
                        <p className="font-medium">{c.employeeName}</p>
                        <p className="text-xs text-muted-foreground">{c.employeeId}</p>
                      </TableCell>
                      <TableCell className="max-w-[20rem] text-sm">
                        <p className="font-medium">{c.title}</p>
                        {c.detail && <p className="text-xs text-muted-foreground">{c.detail}</p>}
                        {c.link && (
                          <a href={c.link} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                            evidence
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="text-xs capitalize">{c.type}</TableCell>
                      <TableCell className="text-xs capitalize">{c.impact}</TableCell>
                      <TableCell className="text-xs capitalize text-muted-foreground">{c.source}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            disabled={verifyContribution.isPending}
                            onClick={() => decide(c.id, "verified")}
                          >
                            <Check className="mr-1 h-3 w-3" /> Verify
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive"
                            disabled={verifyContribution.isPending}
                            onClick={() => decide(c.id, "rejected")}
                          >
                            <X className="mr-1 h-3 w-3" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <ContributionImportPanel roster={employees} />

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display">Recorded decisions</CardTitle>
            <CardDescription className="text-xs">
              Bonuses and awards that a human signed off, with the score they were based on
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/30">
                    <TableHead className="text-xs font-medium">Employee</TableHead>
                    <TableHead className="text-xs font-medium">Period</TableHead>
                    <TableHead className="text-xs font-medium">Kind</TableHead>
                    <TableHead className="text-xs font-medium">Score</TableHead>
                    <TableHead className="text-xs font-medium">Amount</TableHead>
                    <TableHead className="text-xs font-medium">Decided by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {awards.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                        Nothing recorded yet. Ask the agent to propose a split, then approve it above.
                      </TableCell>
                    </TableRow>
                  )}
                  {awards.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm font-medium">{a.employeeName}</TableCell>
                      <TableCell className="text-xs">{a.period}</TableCell>
                      <TableCell className="text-xs capitalize">{a.kind}</TableCell>
                      <TableCell className="text-xs">{a.score}</TableCell>
                      <TableCell className="text-sm font-medium">{inr(a.amount)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.decidedBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          An agent can read this board, propose a split and draw it on this page, but only a person here
          can record it.
        </p>
      </div>
    </DashboardLayout>
  );
}
