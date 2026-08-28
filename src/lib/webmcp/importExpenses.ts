// In-tab expense import — the receipt never leaves the browser.
//
// Two shapes reach us: a finance export (CSV/TSV/JSON) dropped as a file, and
// the text of an actual bill someone pasted or dropped. Both are parsed here, in
// the tab, into the line items `expenseAudit.ts` then judges against company
// policy. Nothing is uploaded, so there is no URL a server could fetch and no
// copy of anyone's personal spend sitting in a bucket — which is exactly why a
// backend API cannot do this job.
//
// The store is deliberately not persisted. Closing the tab discards the claim.
import { categorise, type ExpenseCategory, type ExpenseItem } from "./expenseAudit";
import { parseDelimited, resolveWho, sniffDelimiter, type RosterEntry } from "./importContributions";

export interface ExpenseParse {
  /** File name, or "pasted receipt text". */
  source: string;
  kind: "export" | "receipt";
  /** "csv" | "json" | "text" */
  format: string;
  /** False for a bare card slip — decisive above ₹5,000 under §7. */
  itemised: boolean;
  columns: string[];
  mapping: Record<string, string>;
  items: ExpenseItem[];
  skipped: { line: number; why: string }[];
  /** Identity strings in the file that matched nobody on the roster. */
  unmatched: string[];
  /** Receipts only: the merchant line, when the bill had one. */
  merchant: string;
  /** Receipts only: the total the bill itself states, 0 when absent. */
  statedTotal: number;
  parsedAt: string;
  byteSize: number;
}

type Listener = () => void;

/**
 * Holds the most recent in-browser parse of a claim. Not persisted, by design:
 * an expense claim is somebody's restaurant order and hotel room, and it should
 * survive exactly as long as the tab the human opened it in.
 */
class ExpenseImportStore {
  private state: ExpenseParse | null = null;
  private listeners = new Set<Listener>();

  getSnapshot = (): ExpenseParse | null => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  set = (parse: ExpenseParse): void => {
    this.state = parse;
    this.emit();
  };

  clear = (): void => {
    this.state = null;
    this.emit();
  };

  /** What the agent is told when it asks what was loaded. */
  describe = () => {
    const s = this.state;
    if (!s) return { loaded: false as const, hint: "No claim is loaded. Drop a file on the Expenses page, or paste the receipt text into it." };
    return {
      loaded: true as const,
      source: s.source,
      kind: s.kind,
      format: s.format,
      itemised: s.itemised,
      merchant: s.merchant || undefined,
      statedTotal: s.statedTotal || undefined,
      lineCount: s.items.length,
      claimedTotal: Math.round(s.items.reduce((t, i) => t + i.amount, 0) * 100) / 100,
      travellers: Array.from(
        new Set(s.items.map((i) => i.travellerName || i.travellerId).filter(Boolean))
      ),
      unmatched: s.unmatched,
      skipped: s.skipped,
      columns: s.columns,
      mapping: s.mapping,
      parsedAt: s.parsedAt,
      byteSize: s.byteSize,
      neverUploaded: true as const,
    };
  };
}

export const expenseImport = new ExpenseImportStore();

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

const norm = (s: string): string => String(s ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");

/**
 * Read a rupee figure out of whatever the source wrote: "₹1,240.50", "Rs 1240",
 * "INR 1240/-", "1240.50 Dr". Returns 0 when there is no number, and a negative
 * for a bracketed or minus-signed credit so the caller can skip refunds rather
 * than quietly treating them as spend.
 */
function parseMoney(raw: unknown): number {
  const text = String(raw ?? "").trim();
  if (!text) return 0;
  const bracketed = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/[₹$]|rs\.?|inr|\/-|,|\s|dr|cr/gi, "");
  const m = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!m) return 0;
  const n = Number(m[0]);
  if (!isFinite(n)) return 0;
  return round2(bracketed ? -Math.abs(n) : n);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * Normalise a date as written on a bill to ISO. Slashed and dotted dates are
 * read DAY-FIRST, which is how Indian receipts are printed — stated here rather
 * than guessed silently, because 03/04 is a different day under the other
 * reading. Returns "" when the text holds no date, and never invents one.
 */
export function normaliseExpenseDate(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";

  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;

  const dmy = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/);
  if (dmy) {
    const year = +dmy[3] < 100 ? 2000 + +dmy[3] : +dmy[3];
    return `${year}-${pad(+dmy[2])}-${pad(+dmy[1])}`;
  }

  const dMon = text.match(/\b(\d{1,2})\s*(?:st|nd|rd|th)?[\s-]([a-z]{3,9})\.?[\s,-]*(\d{2,4})?\b/i);
  if (dMon) {
    const month = MONTHS[dMon[2].slice(0, 4).toLowerCase()] ?? MONTHS[dMon[2].slice(0, 3).toLowerCase()];
    if (month) {
      const year = dMon[3] ? (+dMon[3] < 100 ? 2000 + +dMon[3] : +dMon[3]) : new Date().getFullYear();
      return `${year}-${pad(month)}-${pad(+dMon[1])}`;
    }
  }

  const monD = text.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})\s*(?:st|nd|rd|th)?[\s,]*(\d{2,4})?\b/i);
  if (monD) {
    const month = MONTHS[monD[1].slice(0, 4).toLowerCase()] ?? MONTHS[monD[1].slice(0, 3).toLowerCase()];
    if (month) {
      const year = monD[3] ? (+monD[3] < 100 ? 2000 + +monD[3] : +monD[3]) : new Date().getFullYear();
      return `${year}-${pad(month)}-${pad(+monD[2])}`;
    }
  }
  return "";
}

// Header aliases, longest-intent first. A finance export from one system calls
// the claimant "employee_id" and another calls it "traveller" — neither is
// wrong, so both are accepted rather than asking the human to rename columns.
const COLUMN_ALIASES: Record<string, string[]> = {
  who: [
    "employeeid", "empid", "employeecode", "employee", "traveller", "traveler",
    "claimant", "claimedby", "staff", "person", "name", "email", "user", "owner",
  ],
  date: ["date", "expensedate", "txndate", "transactiondate", "spenton", "billdate", "day", "postedon"],
  description: [
    "description", "particulars", "item", "lineitem", "details", "detail",
    "narration", "memo", "merchant", "vendor", "supplier", "expense", "title", "note",
  ],
  amount: ["amount", "amountinr", "amountrs", "total", "value", "gross", "linetotal", "price", "cost", "spend"],
  category: ["category", "expensetype", "type", "head", "class", "glcode", "account"],
};

/** Find which of the file's own headers fills a role, or "" when none does. */
function pickColumn(headers: string[], role: string): string {
  const aliases = COLUMN_ALIASES[role] ?? [];
  for (const alias of aliases) {
    const exact = headers.find((h) => norm(h) === alias);
    if (exact) return exact;
  }
  for (const alias of aliases) {
    const loose = headers.find((h) => norm(h).includes(alias));
    if (loose) return loose;
  }
  return "";
}

/**
 * Trust the file's own category column when it says something we recognise,
 * otherwise read the category out of the line's wording. An export that labels
 * a row "Food & Beverage" and itemises beer inside it still gets the beer
 * caught, because the description is checked too and alcohol wins.
 */
function coerceCategory(categoryText: string, description: string): ExpenseCategory {
  const fromDescription = categorise(description, "other");
  if (fromDescription !== "other") return fromDescription;
  return categorise(categoryText, "other");
}

const byteLen = (text: string): number => {
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length;
  }
};

/**
 * Parse a finance export — CSV, TSV or JSON — into claim lines.
 *
 * Runs entirely in the tab. `roster` is the live employee list already in the
 * page's cache, so a row that says "mike.brown" becomes EMP007 without a round
 * trip. Rows that resolve to nobody are reported in `unmatched` rather than
 * being attached to a guess: the wrong traveller means the wrong daily cap.
 *
 * A one-line export is treated as NOT itemised — the stricter reading, since a
 * single row for ₹9,000 tells you no more than a card slip does.
 */
export function parseExpenseExport(args: {
  source: string;
  text: string;
  roster: RosterEntry[];
  /** Used when the export names no claimant, e.g. HR picked the traveller on screen. */
  fallbackTraveller?: { employeeId: string; name: string };
}): ExpenseParse {
  const text = String(args.text ?? "");
  const roster = args.roster ?? [];
  const skipped: { line: number; why: string }[] = [];
  const unmatched: string[] = [];
  let format = "csv";
  let headers: string[] = [];
  let records: Record<string, unknown>[] = [];

  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    format = "json";
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const rows = Array.isArray(parsed)
        ? parsed
        : (parsed as Record<string, unknown>)?.items ??
          (parsed as Record<string, unknown>)?.rows ??
          (parsed as Record<string, unknown>)?.expenses ??
          (parsed as Record<string, unknown>)?.lines ??
          [parsed];
      records = (Array.isArray(rows) ? rows : [rows]).filter(
        (r) => r && typeof r === "object"
      ) as Record<string, unknown>[];
      const keys = new Set<string>();
      records.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
      headers = Array.from(keys);
    } catch (err) {
      skipped.push({ line: 1, why: `Not valid JSON: ${(err as Error).message}` });
    }
  } else {
    const delim = sniffDelimiter(text);
    format = delim === "\t" ? "tsv" : "csv";
    const rows = parseDelimited(text, delim);
    headers = (rows[0] ?? []).map((h) => String(h).trim());
    records = rows.slice(1).map((row) => {
      const rec: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        rec[h] = row[i] ?? "";
      });
      return rec;
    });
  }

  const col = {
    who: pickColumn(headers, "who"),
    date: pickColumn(headers, "date"),
    description: pickColumn(headers, "description"),
    amount: pickColumn(headers, "amount"),
    category: pickColumn(headers, "category"),
  };
  const mapping: Record<string, string> = {};
  Object.entries(col).forEach(([role, header]) => {
    if (header) mapping[role] = header;
  });

  const items: ExpenseItem[] = [];
  const lineOffset = format === "json" ? 1 : 2;

  records.forEach((rec, index) => {
    const line = index + lineOffset;
    const get = (header: string): string => (header ? String(rec[header] ?? "").trim() : "");

    const amount = parseMoney(col.amount ? get(col.amount) : "");
    if (!amount) {
      skipped.push({ line, why: "No amount on this row." });
      return;
    }
    if (amount < 0) {
      skipped.push({ line, why: `Credit or refund (${amount}) — not a reimbursable claim line.` });
      return;
    }

    const categoryText = get(col.category);
    const description = get(col.description) || categoryText || "unlabelled line";

    const whoText = get(col.who);
    const match = whoText ? resolveWho(whoText, roster) : null;
    if (whoText && !match && !unmatched.includes(whoText)) unmatched.push(whoText);

    items.push({
      id: `x${line}`,
      date: normaliseExpenseDate(col.date ? get(col.date) : ""),
      description,
      category: coerceCategory(categoryText, description),
      amount,
      travellerId: match?.employeeId ?? args.fallbackTraveller?.employeeId ?? "",
      travellerName: match?.name ?? args.fallbackTraveller?.name ?? "",
      from: `row ${line}`,
    });
  });

  return {
    source: args.source || "expense export",
    kind: "export",
    format,
    itemised: items.length >= 2,
    columns: headers,
    mapping,
    items,
    skipped,
    unmatched,
    merchant: "",
    statedTotal: 0,
    parsedAt: new Date().toISOString(),
    byteSize: byteLen(text),
  };
}

// A bill is mostly not line items. These are the lines that carry a number but
// are not spend — totals, tender details, tax registration numbers, phone
// numbers. Counting any of them as a claim line would double the claim.
//
// Both boundaries are anchored deliberately: without the trailing \b, "pan"
// would swallow "Paneer Butter Masala" and "card" would swallow "Cardamom Tea".
const NOISE_LINE =
  /\b(sub\s*total|grand\s*total|total|amount\s*payable|net\s*(payable|amount)|bill\s*(no|amount)|balance|change|round\s*off|tendered|cash|card|visa|master\s*card|mastercard|rupay|amex|upi|paytm|gpay|approval|auth|batch|terminal|tid|mid|invoice|receipt\s*no|order\s*no|token|gstin|gst\s*no|pan\s*no|tin\s*no|fssai|cin\s*no|phone|tel|mobile|contact|cashier|server|table|covers|qty|rate|thank\s*you|visit\s*again|www\.)\b/i;


const HARD_TOTAL = /\b(grand\s*total|amount\s*payable|net\s*payable|net\s*amount|bill\s*amount|total\s*payable)\b/i;
const SOFT_TOTAL = /\btotal\b/i;
const SUBTOTAL = /\bsub\s*total\b/i;

const RESTAURANT_HINT =
  /\b(restaurant|resto|cafe|caf[eé]|bar|bar\s*&|kitchen|dhaba|dining|diner|eatery|grill|bistro|brewery|pub|hotel|food|biryani|pizza|barbeque|barbecue)\b/i;

const TRAILING_AMOUNT = /(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:\/-)?$/i;

/**
 * Parse the text of an actual bill — pasted, or read from a dropped .txt.
 *
 * This is the shape a finance team really receives, and the reason the audit is
 * worth anything: an itemised restaurant bill hides a beer inside a food total,
 * and a card slip hides everything. Both are read here, in the tab.
 *
 * A bill rarely names the employee, so `traveller` supplies who is claiming —
 * the daily meal cap is per traveller per day and cannot be applied without it.
 */
export function parseReceiptText(args: {
  source?: string;
  text: string;
  traveller?: { employeeId: string; name: string };
  /** Overrides the date printed on the bill, when the human states one. */
  date?: string;
}): ExpenseParse {
  const text = String(args.text ?? "");
  const rawLines = text.split(/\r?\n/);
  const skipped: { line: number; why: string }[] = [];
  const items: ExpenseItem[] = [];

  let merchant = "";
  let statedTotal = 0;
  let hardTotal = false;
  let billDate = "";
  const fallback: ExpenseCategory = RESTAURANT_HINT.test(text) ? "meal" : "other";

  rawLines.forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim().replace(/\s{2,}/g, " ");
    if (!trimmed) return;

    if (!billDate) {
      const found = normaliseExpenseDate(trimmed);
      if (found) billDate = found;
    }

    const money = trimmed.match(TRAILING_AMOUNT);
    const label = money ? trimmed.slice(0, money.index).replace(/[.\-–:x*]+$/i, "").trim() : trimmed;

    if (!money) {
      // No figure on the line: the first such line is the merchant's name.
      if (!merchant && !NOISE_LINE.test(trimmed) && /[a-z]/i.test(trimmed)) merchant = trimmed;
      return;
    }

    const amount = parseMoney(money[1]);

    // "Date: 12/03/2026" and "Time: 20:15" both end in digits. A figure glued to
    // a colon or slash is part of a time or a date, never a price. Dashed and
    // dotted dates are matched whole, so "Coffee Rs.180" is still a price.
    const numStart = trimmed.lastIndexOf(money[1]);
    const gluedToDate = numStart > 0 && /[:/]/.test(trimmed[numStart - 1]);
    if (gluedToDate || /\b\d{1,2}[-.]\d{1,2}[-.]\d{2,4}\s*$/.test(trimmed)) {
      skipped.push({ line, why: "Date or time on the bill, not an amount." });
      return;
    }

    if (HARD_TOTAL.test(trimmed)) {
      statedTotal = amount;
      hardTotal = true;
      skipped.push({ line, why: `Bill total (${amount}) — recorded, not claimed as a line.` });
      return;
    }
    if (SUBTOTAL.test(trimmed)) {
      skipped.push({ line, why: "Subtotal line — the items above it are what get claimed." });
      return;
    }
    if (SOFT_TOTAL.test(trimmed)) {
      if (!hardTotal) statedTotal = amount;
      skipped.push({ line, why: `Total line (${amount}) — recorded, not claimed as a line.` });
      return;
    }
    if (NOISE_LINE.test(trimmed)) {
      skipped.push({ line, why: "Not a spend line (tender, tax registration or contact detail)." });
      return;
    }
    if (!label || !/[a-z]/i.test(label)) {
      skipped.push({ line, why: "A figure with nothing describing it — cannot be categorised." });
      return;
    }
    if (amount <= 0) {
      skipped.push({ line, why: "Zero or credit amount." });
      return;
    }

    items.push({
      id: `r${line}`,
      date: args.date || billDate,
      description: label,
      category: categorise(label, fallback),
      amount,
      travellerId: args.traveller?.employeeId ?? "",
      travellerName: args.traveller?.name ?? "",
      from: `receipt line ${line}`,
    });
  });

  // The date is usually printed above the items, but not always — backfill so a
  // bill that prints it in the footer still lands in the right day's cap.
  if (billDate || args.date)
    items.forEach((i) => {
      if (!i.date) i.date = args.date || billDate;
    });

  // A card slip: a total and nothing else. Claim it as one line so the human
  // sees the figure, and leave `itemised` false so §7 asks for the real bill.
  if (!items.length && statedTotal > 0) {
    items.push({
      id: "r0",
      date: args.date || billDate,
      description: merchant ? `${merchant} — card slip total` : "card slip total",
      category: categorise(merchant, "other"),
      amount: statedTotal,
      travellerId: args.traveller?.employeeId ?? "",
      travellerName: args.traveller?.name ?? "",
      from: "card slip",
    });
  }

  const claimed = round2(items.reduce((t, i) => t + i.amount, 0));
  // Two or more real lines that add up to the printed total is what "itemised"
  // means. One synthesised line from a slip is not.
  const itemised = items.length >= 2 || (items.length === 1 && items[0].from !== "card slip" && !statedTotal);

  if (statedTotal > 0 && items.length >= 2 && Math.abs(claimed - statedTotal) > 1)
    skipped.push({
      line: 0,
      why:
        `Lines add to ${claimed} but the bill states ${statedTotal}. ` +
        `Something on it was not read — check before reimbursing.`,
    });

  return {
    source: args.source || "pasted receipt text",
    kind: "receipt",
    format: "text",
    itemised,
    columns: [],
    mapping: {},
    items,
    skipped,
    unmatched: [],
    merchant,
    statedTotal,
    parsedAt: new Date().toISOString(),
    byteSize: byteLen(text),
  };
}

/** Decide which parser a dropped file wants, from its name and its content. */
export function parseExpenseSource(args: {
  source: string;
  text: string;
  roster: RosterEntry[];
  traveller?: { employeeId: string; name: string };
}): ExpenseParse {
  const name = String(args.source ?? "").toLowerCase();
  const trimmed = String(args.text ?? "").trim();
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  // A header row naming both an amount and a description is an export. It only
  // counts as a header if it is actually delimited — a bill that prints
  // "Item Rate Amount" across the top is still a bill.
  const cells = /[,\t;|]/.test(firstLine) ? firstLine.split(/[,\t;|]/) : [];
  const structured =
    /\.(csv|tsv|json)$/.test(name) ||
    trimmed.startsWith("[") ||
    trimmed.startsWith("{") ||
    (!!pickColumn(cells, "amount") && !!pickColumn(cells, "description"));

  return structured
    ? parseExpenseExport({
        source: args.source,
        text: args.text,
        roster: args.roster,
        fallbackTraveller: args.traveller,
      })
    : parseReceiptText({ source: args.source, text: args.text, traveller: args.traveller });
}
