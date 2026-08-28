import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FileUp, X, ShieldCheck, AlertTriangle, Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLeaveRequests } from "@/hooks/hrms";
import type { Employee } from "@/types/db";
import { canvas } from "@/lib/webmcp/canvas";
import { auditExpenses, type ExpenseItem, type LinkedRequest } from "@/lib/webmcp/expenseAudit";
import { expenseImport, parseExpenseSource, parseReceiptText } from "@/lib/webmcp/importExpenses";

const MAX_BYTES = 2 * 1024 * 1024;

const inr = (v: number): string => `₹${Math.round(Number(v) || 0).toLocaleString("en-IN")}`;

/**
 * Where a travel claim enters the system — and the only place it exists.
 *
 * A finance export or the text of an actual bill is read with FileReader (or
 * pasted straight in) and parsed in this tab. It is never uploaded, has no URL,
 * and no OCR service or bucket ever holds a copy of somebody's restaurant order.
 * That is precisely why the companion tool `read_expense_import` cannot have a
 * REST equivalent: the agent is reasoning over state that exists only inside the
 * page the human is looking at.
 */
export function ExpenseImportPanel({ roster }: { roster: Employee[] }) {
  const parsed = useSyncExternalStore(
    expenseImport.subscribe,
    expenseImport.getSnapshot,
    expenseImport.getSnapshot
  );
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [pasted, setPasted] = useState("");
  const [travellerId, setTravellerId] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { data: leaves = [] } = useLeaveRequests();

  const rosterEntries = useMemo(
    () => roster.map((e) => ({ employeeId: e.id, name: e.name, email: e.email })),
    [roster]
  );
  const traveller = useMemo(() => {
    const match = roster.find((e) => e.id === travellerId);
    return match ? { employeeId: match.id, name: match.name } : undefined;
  }, [roster, travellerId]);

  const handleFile = (file: File) => {
    setError("");
    if (file.size > MAX_BYTES) {
      setError(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB — keep it under 2 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError(`Could not read ${file.name}.`);
    reader.onload = () => {
      const result = parseExpenseSource({
        source: file.name,
        text: String(reader.result ?? ""),
        roster: rosterEntries,
        traveller,
      });
      expenseImport.set(result);
      canvas.clearExpenseAudit();
      if (!result.items.length)
        setError("No claim lines were found in that file. It needs an amount per line at minimum.");
    };
    reader.readAsText(file);
  };

  const readPasted = () => {
    setError("");
    const text = pasted.trim();
    if (!text) return;
    const result = parseReceiptText({ text, traveller });
    expenseImport.set(result);
    canvas.clearExpenseAudit();
    if (!result.items.length)
      setError("Nothing on that bill parsed as a priced line. Check it has amounts at the end of each line.");
  };

  /**
   * Run the audit from the page itself, so the screen is useful without an agent
   * attached. It uses the same pure engine the tool uses, and the same live leave
   * data, so both paths reach identical verdicts.
   */
  const auditNow = () => {
    const claim = expenseImport.getSnapshot();
    if (!claim?.items.length) return;
    const items: ExpenseItem[] = claim.items.map((i) => ({
      ...i,
      travellerId: i.travellerId || (traveller?.employeeId ?? ""),
      travellerName: i.travellerName || (traveller?.name ?? ""),
    }));
    expenseImport.set({ ...claim, items });

    const dates = items.map((i) => i.date).filter(Boolean).sort();
    const from = dates[0] ?? "";
    const to = dates[dates.length - 1] ?? "";
    const linkedRequests: Record<string, LinkedRequest | null> = {};
    Array.from(new Set(items.map((i) => i.travellerId).filter(Boolean))).forEach((id) => {
      const overlapping = leaves.filter(
        (r: any) =>
          r.employeeId === id &&
          (!to || String(r.startDate) <= to) &&
          (!from || String(r.endDate || r.startDate) >= from)
      );
      const best = overlapping.find((r: any) => /approve/i.test(String(r.status ?? ""))) ?? overlapping[0];
      linkedRequests[id] = best
        ? {
            requestId: String(best.id),
            status: String(best.status ?? ""),
            startDate: String(best.startDate ?? ""),
            endDate: String(best.endDate ?? best.startDate ?? ""),
          }
        : null;
    });

    canvas.showExpenseAudit(
      auditExpenses({ source: claim.source, itemised: claim.itemised, items, linkedRequests })
    );
  };

  const claimedTotal = (parsed?.items ?? []).reduce((t, i) => t + i.amount, 0);

  return (
    <Card className="border-border shadow-soft">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
              <FileUp className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-display">Load a travel claim</CardTitle>
              <p className="text-xs text-muted-foreground">
                An expense export or the bill itself. Parsed in this tab, never uploaded.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="border-success/20 bg-success/10 text-[10px] text-success">
            <ShieldCheck className="mr-1 h-3 w-3" /> stays in the browser
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer?.files?.[0];
            if (file) handleFile(file);
          }}
          className={`cursor-pointer rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border bg-secondary/20"
          }`}
        >
          <p className="font-medium">Drop an expense export or a bill here</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            CSV, TSV or JSON is read as a claim per row. A .txt bill is read line by line — itemised
            food, alcohol, service charge and tax are picked out of the wording.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt,.json,text/csv,text/plain,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="space-y-1.5">
            <label className="text-xs font-medium" htmlFor="receipt-text">
              Or paste the bill
            </label>
            <Textarea
              id="receipt-text"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={"Blue Terrace Restaurant\n12/03/2026\nPaneer Butter Masala   340\nKingfisher Beer 2      640\nService charge         120\nCGST 2.5%               45\nTotal                 1145"}
              className="min-h-[7.5rem] font-mono text-xs"
            />
            <Button size="sm" variant="secondary" onClick={readPasted} disabled={!pasted.trim()}>
              Read pasted bill
            </Button>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium" htmlFor="traveller">
              Traveller
            </label>
            <select
              id="traveller"
              value={travellerId}
              onChange={(e) => setTravellerId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Not set</option>
              {roster.map((e) => (
                <option key={e.id} value={e.id}>{e.name} · {e.id}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              A bill rarely names the claimant, and the ₹1,200 daily meal cap is per traveller per day —
              so without this, the cap cannot be applied.
            </p>
          </div>
        </div>

        {error && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        {parsed && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">{parsed.source}</span>
              <Badge variant="outline" className="text-[10px] uppercase">{parsed.format}</Badge>
              <Badge
                variant="outline"
                className={
                  parsed.itemised
                    ? "border-success/20 bg-success/10 text-[10px] text-success"
                    : "border-warning/20 bg-warning/10 text-[10px] text-warning"
                }
              >
                {parsed.itemised ? "itemised" : "not itemised"}
              </Badge>
              <span className="text-muted-foreground">
                {parsed.items.length} line(s) · {inr(claimedTotal)} claimed
                {parsed.statedTotal ? ` · bill states ${inr(parsed.statedTotal)}` : ""} ·{" "}
                {(parsed.byteSize / 1024).toFixed(1)} KB
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 px-2 text-xs"
                onClick={() => { expenseImport.clear(); canvas.clearExpenseAudit(); setError(""); }}
              >
                <X className="mr-1 h-3 w-3" /> Clear
              </Button>
            </div>

            {parsed.merchant && (
              <p className="text-xs text-muted-foreground">Merchant read from the bill: {parsed.merchant}</p>
            )}
            {Object.keys(parsed.mapping).length > 0 && (
              <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs">
                <p className="font-medium">Column mapping</p>
                <p className="mt-0.5 text-muted-foreground">
                  {Object.entries(parsed.mapping).map(([field, col]) => `${field} ← ${col}`).join(" · ")}
                </p>
              </div>
            )}
            {parsed.unmatched.length > 0 && (
              <p className="text-xs text-warning">
                No roster match for: {parsed.unmatched.join(", ")} — those lines have no traveller, so no
                daily cap can be applied to them.
              </p>
            )}
            {parsed.skipped.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {parsed.skipped.length} line(s) not claimed — {parsed.skipped[0].why}
                {parsed.skipped.length > 1 ? " (and similar)" : ""}
              </p>
            )}

            {parsed.items.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/30">
                      <TableHead className="text-xs font-medium">Line</TableHead>
                      <TableHead className="text-xs font-medium">Read as</TableHead>
                      <TableHead className="text-xs font-medium">Date</TableHead>
                      <TableHead className="text-xs font-medium">Traveller</TableHead>
                      <TableHead className="text-right text-xs font-medium">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.items.slice(0, 12).map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="max-w-[18rem] truncate text-xs">{i.description}</TableCell>
                        <TableCell className="text-xs capitalize">{i.category}</TableCell>
                        <TableCell className="text-xs">{i.date || "—"}</TableCell>
                        <TableCell className="text-xs">
                          {i.travellerName || <span className="text-warning">not set</span>}
                        </TableCell>
                        <TableCell className="text-right text-xs">{inr(i.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {parsed.items.length > 12 && (
              <p className="text-[11px] text-muted-foreground">
                Showing the first 12 of {parsed.items.length}. The agent can read all of them via
                {" "}<code>read_expense_import</code>.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={auditNow} disabled={!parsed.items.length}>
                <Scale className="mr-1.5 h-3.5 w-3.5" /> Audit against Finance Policy §7
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Nothing is reimbursed by auditing — it marks up the claim for you to decide on.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
