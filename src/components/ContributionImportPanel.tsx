import { useRef, useState, useSyncExternalStore } from "react";
import { FileUp, X, ShieldCheck, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useLogContributions } from "@/hooks/hrms";
import type { Employee } from "@/types/db";
import { contributionImport, parseWorkExport } from "@/lib/webmcp/importContributions";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Drop zone for a work-data export (GitHub PR list, Jira CSV, a spreadsheet of
 * shipped work).
 *
 * The file is read with FileReader and parsed in this tab. It is never uploaded,
 * has no URL, and no server ever sees it — which is exactly why the companion
 * WebMCP tool `read_contribution_import` has no possible REST equivalent: the
 * agent is reasoning over state that only exists inside the page the human is
 * looking at. Rows are written to the database only after HR presses Log.
 */
export function ContributionImportPanel({ roster }: { roster: Employee[] }) {
  const parsed = useSyncExternalStore(
    contributionImport.subscribe,
    contributionImport.getSnapshot,
    contributionImport.getSnapshot
  );
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const logRows = useLogContributions();

  const handleFile = (file: File) => {
    setError("");
    if (file.size > MAX_BYTES) {
      setError(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB — keep it under 2 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError(`Could not read ${file.name}.`);
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const result = parseWorkExport(
        file.name,
        text,
        roster.map((e) => ({ employeeId: e.id, name: e.name, email: e.email }))
      );
      contributionImport.set(result);
      if (!result.rows.length)
        setError("Nothing usable in that file — it needs a title/summary column at minimum.");
    };
    reader.readAsText(file);
  };

  const usable = (parsed?.rows ?? []).filter((r) => r.employeeId);

  const logAll = () => {
    if (!usable.length) return;
    logRows.mutate(
      usable.map((r) => ({
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        department: roster.find((e) => e.id === r.employeeId)?.department ?? "",
        title: r.title,
        detail: `Imported from ${parsed?.fileName} (${r.from})`,
        type: r.type,
        impact: r.impact,
        occurredOn: r.occurredOn,
        link: r.link,
        source: "import" as const,
        status: "claimed" as const,
      })),
      {
        onSuccess: () => {
          toast({
            title: `${usable.length} contribution(s) logged`,
            description: "They are claims until you verify them — unverified work scores zero.",
          });
          contributionImport.clear();
        },
        onError: () =>
          toast({ title: "Could not log rows", description: "Please try again.", variant: "destructive" }),
      }
    );
  };

  return (
    <Card className="border-border shadow-soft">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
              <FileUp className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-display">Import work data</CardTitle>
              <p className="text-xs text-muted-foreground">
                Parsed in this tab. Never uploaded, so the agent can read a file no API could fetch.
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
          <p className="font-medium">Drop a CSV, TSV or JSON export here</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Columns are matched automatically — author/assignee, title/summary, type/labels, priority, date, link.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt,.json,text/csv,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
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
              <span className="font-medium">{parsed.fileName}</span>
              <Badge variant="outline" className="text-[10px] uppercase">{parsed.format}</Badge>
              <span className="text-muted-foreground">
                {parsed.rows.length} row(s) read · {usable.length} matched to the roster ·{" "}
                {(parsed.byteSize / 1024).toFixed(1)} KB
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 px-2 text-xs"
                onClick={() => { contributionImport.clear(); setError(""); }}
              >
                <X className="mr-1 h-3 w-3" /> Clear
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs">
              <p className="font-medium">Column mapping</p>
              <p className="mt-0.5 text-muted-foreground">
                {Object.entries(parsed.mapping).map(([field, col]) => `${field} ← ${col}`).join(" · ")}
              </p>
            </div>

            {parsed.unmatched.length > 0 && (
              <p className="text-xs text-warning">
                No roster match for: {parsed.unmatched.join(", ")} — those rows are shown but will not be logged.
              </p>
            )}
            {parsed.skipped.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {parsed.skipped.length} row(s) skipped — {parsed.skipped[0].why}
                {parsed.skipped.length > 1 ? " (and similar)" : ""}
              </p>
            )}

            {parsed.rows.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/30">
                      <TableHead className="text-xs font-medium">Who</TableHead>
                      <TableHead className="text-xs font-medium">Title</TableHead>
                      <TableHead className="text-xs font-medium">Type</TableHead>
                      <TableHead className="text-xs font-medium">Impact</TableHead>
                      <TableHead className="text-xs font-medium">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.slice(0, 12).map((r, i) => (
                      <TableRow key={`${r.who}-${r.title}-${i}`} className={r.employeeId ? "" : "opacity-50"}>
                        <TableCell className="text-xs">
                          {r.employeeName}
                          {r.employeeId
                            ? <span className="ml-1.5 text-muted-foreground">{r.employeeId}</span>
                            : <span className="ml-1.5 text-warning">unmatched</span>}
                        </TableCell>
                        <TableCell className="max-w-[20rem] truncate text-xs">{r.title}</TableCell>
                        <TableCell className="text-xs capitalize">{r.type}</TableCell>
                        <TableCell className="text-xs capitalize">{r.impact}</TableCell>
                        <TableCell className="text-xs">{r.occurredOn}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {parsed.rows.length > 12 && (
              <p className="text-[11px] text-muted-foreground">
                Showing the first 12 of {parsed.rows.length}. The agent can read all of them via
                {" "}<code>read_contribution_import</code>.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={logAll} disabled={logRows.isPending || !usable.length}>
                {logRows.isPending ? "Logging…" : `Log ${usable.length} row(s) as claims`}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                They arrive unverified and score nothing until you verify them.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
