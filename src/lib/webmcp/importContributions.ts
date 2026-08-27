// Client-side work-export import — the file never leaves the browser.
//
// This is the capability that has no server-side equivalent. HR drops a CSV or
// JSON export (GitHub PRs, Jira issues, a spreadsheet of shipped work) onto the
// Bonuses page; it is parsed here, in the tab, and held in memory. A WebMCP tool
// then reads the parsed result, so a browser agent can reason over a file that
// was never uploaded, has no URL, and that no backend API could ever fetch.
//
// Nothing is persisted until a human approves it, at which point the rows are
// written as `source: 'import'` contributions like any other evidence.
import type { ContributionType } from "@/types/db";
import { extractJoinDate, today } from "./parseEmployee";

export interface ParsedRow {
  /** Raw identity string from the file (author login, email, name, or EMP id). */
  who: string;
  /** Resolved against the live roster, empty when we could not match. */
  employeeId: string;
  employeeName: string;
  title: string;
  type: ContributionType;
  impact: "low" | "medium" | "high";
  occurredOn: string;
  link: string;
  /** Which source columns produced this row, for the "why" drill-down. */
  from: string;
}

export interface ImportResult {
  fileName: string;
  /** "csv" | "json" */
  format: string;
  /** Header names found in the file, in order. */
  columns: string[];
  /** How each contribution field was sourced from those columns. */
  mapping: Record<string, string>;
  rows: ParsedRow[];
  /** Rows we could not use, with the reason. */
  skipped: { line: number; why: string }[];
  /** Rows whose author matched nobody on the roster. */
  unmatched: string[];
  parsedAt: string;
  byteSize: number;
}

type Listener = () => void;

/**
 * Holds the most recent in-browser parse. Deliberately not persisted: closing
 * the tab discards it, which is the correct privacy behaviour for a file the
 * user only meant to look at once.
 */
class ImportStore {
  private state: ImportResult | null = null;
  private listeners = new Set<Listener>();

  getSnapshot = (): ImportResult | null => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  set(result: ImportResult | null) {
    this.state = result;
    this.listeners.forEach((fn) => fn());
  }

  clear() {
    this.set(null);
  }

  /** Compact summary for the agent — row detail comes from the tool itself. */
  describe(): Record<string, unknown> {
    if (!this.state) return { loaded: false, hint: "No file has been dropped on the Bonuses page yet." };
    const s = this.state;
    return {
      loaded: true, fileName: s.fileName, format: s.format, columns: s.columns,
      mapping: s.mapping, usableRows: s.rows.length, skipped: s.skipped.length,
      unmatchedAuthors: s.unmatched, parsedAt: s.parsedAt, byteSize: s.byteSize,
      neverUploaded: true,
    };
  }
}

export const contributionImport = new ImportStore();

// ------------------------------------------------------------------ parsing

/** Scan delimited text into rows, honouring quoted fields and quoted newlines. */
export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === delim) { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

/** Pick the delimiter by counting candidates outside quotes on the first line. */
export function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const outside = firstLine.replace(/"[^"]*"/g, "");
  const counts = [",", "\t", ";", "|"].map((d) => ({ d, n: outside.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

// ------------------------------------------------- column + value mapping

/**
 * Header aliases, most specific first. A column is claimed by the first field
 * that wants it, which is why "author" beats "name" for identity.
 */
const FIELD_ALIASES: Record<string, string[]> = {
  who: [
    "employee_id", "employeeid", "emp_id", "empid", "employee", "author_login", "author",
    "assignee", "developer", "owner", "reporter", "user", "username", "login", "email", "name",
  ],
  title: [
    "title", "summary", "subject", "commit_message", "message", "task", "issue",
    "pr_title", "description", "name",
  ],
  type: ["type", "category", "kind", "issue_type", "labels", "label", "tag"],
  impact: ["impact", "severity", "priority", "weight", "story_points", "points", "effort"],
  occurredOn: [
    "occurred_on", "merged_at", "resolved_at", "closed_at", "completed_at",
    "date", "day", "created_at", "updated_at",
  ],
  link: ["link", "html_url", "url", "permalink", "issue_url", "href"],
};

const TYPE_HINTS: [RegExp, ContributionType][] = [
  [/\b(fix|bug|bugfix|hotfix|defect|incident|patch|regression)\b/i, "fix"],
  [/\b(doc|docs|documentation|readme|runbook|adr|guide)\b/i, "documentation"],
  [/\b(mentor|mentoring|onboard|onboarding|pair|paired|coach|training|train)\b/i, "mentoring"],
  [/\b(refactor|perf|performance|improve|improvement|optimis|optimiz|cleanup|polish)\b/i, "improvement"],
  [/\b(support|oncall|on-call|triage|maintenance|chore|ops|rotation)\b/i, "support"],
  [/\b(initiative|proposal|spike|research|prototype|rfc)\b/i, "initiative"],
  [/\b(feat|feature|epic|story|deliver|delivery|ship|shipped|release|launch)\b/i, "delivery"],
];

const norm = (v: unknown): string => String(v ?? "").trim();
const lower = (v: unknown): string => norm(v).toLowerCase();

/** Best column for a field, skipping ones already claimed. */
function pickColumn(field: string, headers: string[], taken: Set<string>): string {
  const aliases = FIELD_ALIASES[field] ?? [];
  const normalised = headers.map((h) => ({ raw: h, key: lower(h).replace(/[\s-]+/g, "_") }));
  for (const alias of aliases) {
    const exact = normalised.find((h) => h.key === alias && !taken.has(h.raw));
    if (exact) { taken.add(exact.raw); return exact.raw; }
  }
  for (const alias of aliases) {
    const partial = normalised.find((h) => h.key.includes(alias) && !taken.has(h.raw));
    if (partial) { taken.add(partial.raw); return partial.raw; }
  }
  return "";
}

/** Infer a contribution type from whatever the export called it. */
export function normaliseType(raw: string, titleFallback: string): ContributionType {
  for (const [re, type] of TYPE_HINTS) if (re.test(raw)) return type;
  for (const [re, type] of TYPE_HINTS) if (re.test(titleFallback)) return type;
  return "delivery";
}

/** Infer impact from a priority, severity or story-point column. */
export function normaliseImpact(raw: string): "low" | "medium" | "high" {
  const v = lower(raw);
  if (/\b(p0|p1|critical|blocker|highest|severe|major|high)\b/.test(v)) return "high";
  if (/\b(p2|medium|moderate|normal|default)\b/.test(v)) return "medium";
  if (/\b(p3|p4|low|minor|trivial|lowest)\b/.test(v)) return "low";
  const points = Number(v.replace(/[^\d.]/g, ""));
  if (Number.isFinite(points) && points > 0) {
    if (points >= 8) return "high";
    if (points >= 3) return "medium";
    return "low";
  }
  return "medium";
}

export interface RosterEntry {
  employeeId: string;
  name: string;
  email: string;
}

/**
 * Match whatever identity string the export used to a real employee.
 * Tried in order: EMP id, exact email, email local part, full name, name with
 * punctuation stripped (so "mike.brown" and "mikebrown" both land), then a
 * first-name match only when it is unambiguous.
 */
export function resolveWho(who: string, roster: RosterEntry[]): RosterEntry | null {
  const v = norm(who);
  if (!v) return null;
  const key = lower(v);
  const squash = (s: string) => lower(s).replace(/[^a-z0-9]/g, "");

  const byId = roster.find((r) => lower(r.employeeId) === key);
  if (byId) return byId;

  const byEmail = roster.find((r) => lower(r.email) === key);
  if (byEmail) return byEmail;

  const localPart = key.split("@")[0];
  const byLocal = roster.find((r) => lower(r.email).split("@")[0] === localPart);
  if (byLocal) return byLocal;

  const byName = roster.find((r) => lower(r.name) === key);
  if (byName) return byName;

  const bySquash = roster.find((r) => squash(r.name) === squash(v) || squash(r.email).startsWith(squash(v)));
  if (bySquash) return bySquash;

  const first = key.split(/[\s._-]+/)[0];
  if (first.length >= 3) {
    const matches = roster.filter((r) => lower(r.name).split(/\s+/)[0] === first);
    if (matches.length === 1) return matches[0];
  }
  return null;
}

/** Flatten parsed JSON into header/record form so CSV and JSON share a path. */
function recordsFromJson(parsed: unknown): { headers: string[]; records: Record<string, unknown>[] } {
  let list: unknown[] = [];
  if (Array.isArray(parsed)) list = parsed;
  else if (parsed && typeof parsed === "object") {
    const holder = parsed as Record<string, unknown>;
    const arrayKey = ["items", "issues", "values", "data", "results", "records", "rows"]
      .find((k) => Array.isArray(holder[k]));
    if (arrayKey) list = holder[arrayKey] as unknown[];
  }
  const records = list.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
  const headers: string[] = [];
  for (const rec of records.slice(0, 50))
    for (const k of Object.keys(rec)) if (!headers.includes(k)) headers.push(k);
  return { headers, records };
}

/** Normalise whatever date shape the export used down to an ISO date. */
function normaliseDate(raw: string): string {
  const v = norm(raw);
  if (!v) return "";
  const isoPrefix = v.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];
  const slashed = v.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slashed)
    return `${slashed[1]}-${slashed[2].padStart(2, "0")}-${slashed[3].padStart(2, "0")}`;
  return extractJoinDate(v);
}

const byteLength = (text: string): number => {
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length;
  }
};

/**
 * Parse a dropped work-data export into candidate contribution rows.
 * Pure: takes text that the caller already read with FileReader, returns a
 * result for the in-memory store. No network, no server, no upload.
 */
export function parseWorkExport(fileName: string, text: string, roster: RosterEntry[]): ImportResult {
  const trimmed = text.replace(/^﻿/, "").trim();
  const looksJson = /\.json$/i.test(fileName) || trimmed.startsWith("[") || trimmed.startsWith("{");

  let headers: string[] = [];
  let records: Record<string, unknown>[] = [];
  const skipped: { line: number; why: string }[] = [];
  let format = "csv";

  if (looksJson) {
    format = "json";
    try {
      const flat = recordsFromJson(JSON.parse(trimmed));
      headers = flat.headers;
      records = flat.records;
      if (!records.length) skipped.push({ line: 0, why: "JSON held no array of objects to read" });
    } catch (e: any) {
      skipped.push({ line: 0, why: `not valid JSON — ${e?.message ?? "parse failed"}` });
    }
  } else {
    const grid = parseDelimited(trimmed, sniffDelimiter(trimmed));
    if (grid.length < 2) {
      skipped.push({ line: 0, why: "no data rows found under the header" });
    } else {
      headers = grid[0].map((h) => norm(h));
      records = grid.slice(1).map((cells) => {
        const rec: Record<string, unknown> = {};
        headers.forEach((h, i) => { rec[h] = cells[i]; });
        return rec;
      });
    }
  }

  // Claim one column per field, most specific alias winning.
  const taken = new Set<string>();
  const cols = {
    who: pickColumn("who", headers, taken),
    title: pickColumn("title", headers, taken),
    type: pickColumn("type", headers, taken),
    impact: pickColumn("impact", headers, taken),
    occurredOn: pickColumn("occurredOn", headers, taken),
    link: pickColumn("link", headers, taken),
  };

  const rows: ParsedRow[] = [];
  const unmatched: string[] = [];

  records.forEach((rec, i) => {
    const line = i + 2; // header is line 1
    const title = norm(rec[cols.title]);
    if (!title) {
      skipped.push({ line, why: cols.title ? "no title value" : "no usable title column in this file" });
      return;
    }
    const who = norm(rec[cols.who]);
    const match = resolveWho(who, roster);
    if (!match && who && !unmatched.includes(who)) unmatched.push(who);

    const typeRaw = norm(rec[cols.type]);
    const occurredOn = normaliseDate(norm(rec[cols.occurredOn])) || today();
    const sourced = [
      cols.who && `who←${cols.who}`, cols.title && `title←${cols.title}`,
      cols.type && `type←${cols.type}`, cols.impact && `impact←${cols.impact}`,
      cols.occurredOn && `date←${cols.occurredOn}`,
    ].filter(Boolean).join(", ");

    rows.push({
      who,
      employeeId: match?.employeeId ?? "",
      employeeName: match?.name ?? who,
      title,
      type: normaliseType(typeRaw, title),
      impact: normaliseImpact(norm(rec[cols.impact])),
      occurredOn,
      link: norm(rec[cols.link]),
      from: sourced,
    });
  });

  return {
    fileName, format, columns: headers,
    mapping: Object.fromEntries(
      Object.entries(cols).map(([field, col]) => [field, col || "(not found — inferred or defaulted)"])
    ),
    rows, skipped, unmatched,
    parsedAt: new Date().toISOString(),
    byteSize: byteLength(text),
  };
}
