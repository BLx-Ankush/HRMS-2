// Deterministic field derivation for `add_employee_from_description`.
//
// The agent is the language parser — it reads the admin's sentence and passes
// whatever it recognised. This module is the part an LLM should NOT be trusted
// with: assigning the next free employee ID, snapping a department onto one the
// company actually uses, resolving a loose date to a real ISO date, and building
// a house-style email. All of it is pure and testable, and every derived value
// is reported back so the human can see what was inferred rather than stated.

export interface Derivation {
  /** Field name as shown to the human. */
  label: string;
  value: string;
  /** How we got it: stated by the admin, or worked out by us. */
  source: "stated" | "derived";
  /** Short explanation, shown for derived values. */
  note?: string;
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

/** Common shorthand admins type instead of the real department name. */
const DEPT_ALIASES: Record<string, string> = {
  eng: "Engineering", engg: "Engineering", dev: "Engineering",
  hr: "Human Resources", "human resource": "Human Resources", people: "Human Resources",
  ops: "Operations", mktg: "Marketing", marketing: "Marketing",
  fin: "Finance", acct: "Finance", accounts: "Finance", accounting: "Finance",
  design: "Design", ux: "Design", ui: "Design", sales: "Sales", it: "IT",
  support: "Support", cs: "Support", qa: "Quality Assurance", legal: "Legal",
};

/** Role nouns used to spot a job title inside prose. */
const ROLE_NOUNS = [
  "developer", "engineer", "designer", "manager", "analyst", "intern", "lead",
  "architect", "executive", "specialist", "consultant", "accountant", "recruiter",
  "director", "officer", "scientist", "administrator", "technician", "associate",
  "coordinator", "assistant", "strategist", "writer", "tester", "head",
];

const titleCase = (v: string): string =>
  v
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const today = (): string => iso(new Date());

// ---------------------------------------------------------------- extraction

export function extractEmail(text: string): string {
  const m = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0] : "";
}

export function extractPhone(text: string): string {
  // Strip any email first so its digits can't be mistaken for a number.
  const cleaned = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, " ");
  for (const m of cleaned.matchAll(/\+?\d[\d\s().-]{7,}\d/g)) {
    const digits = m[0].replace(/\D/g, "");
    // 10–15 digits is a phone; 8 would also match an ISO date once punctuation goes.
    if (digits.length >= 10 && digits.length <= 15) return m[0].trim();
  }
  return "";
}

export function extractEmployeeId(text: string): string {
  const m = text.match(/\bEMP[\s-]?(\d{2,4})\b/i);
  return m ? `EMP${m[1].padStart(3, "0")}` : "";
}

/**
 * Resolve a date phrase to ISO. Handles `2026-09-15`, `15 Sept 2026`,
 * `September 15, 2026`, and bare `Sept 15` (year inferred). Returns "" when the
 * text holds no recognisable date.
 */
export function extractJoinDate(text: string, now = new Date()): string {
  const isoMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (isoMatch) return isoMatch[0];

  const tryBuild = (monthTok: string, dayTok: string, yearTok?: string): string => {
    const month = MONTHS[monthTok.toLowerCase().replace(/\.$/, "")];
    if (month === undefined) return "";
    const day = Number(dayTok);
    if (!day || day > 31) return "";
    if (yearTok) return iso(new Date(Number(yearTok), month, day));
    // No year stated: assume the nearest sensible one. Hires are normally
    // upcoming, so a date well in the past means they meant next year.
    const candidate = new Date(now.getFullYear(), month, day);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);
    if (candidate < sixtyDaysAgo) candidate.setFullYear(now.getFullYear() + 1);
    return iso(candidate);
  };

  // "15 September 2026" / "15th Sept"
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:\s+(\d{4}))?/g)) {
    const built = tryBuild(m[2], m[1], m[3]);
    if (built) return built;
  }
  // "September 15, 2026" / "Sept 15"
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/g)) {
    const built = tryBuild(m[1], m[2], m[3]);
    if (built) return built;
  }
  return "";
}

export function extractStatus(text: string): string {
  const t = text.toLowerCase();
  if (/\bon leave\b|\bon_leave\b/.test(t)) return "on_leave";
  if (/\binactive\b|\bterminated\b|\bex-employee\b/.test(t)) return "inactive";
  return "";
}

export function extractSkills(text: string): string[] {
  const m = text.match(/\bskills?\s*(?:include|includes|are|is|:|-)\s*([^.;\n]+)/i);
  if (!m) return [];
  return m[1]
    .split(/,|\band\b|\//i)
    .map((v) => v.trim())
    .filter((v) => v.length > 1 && v.length < 40)
    .slice(0, 12);
}

/** Best-effort job title from prose, e.g. "as a senior backend developer in ..." */
export function extractPosition(text: string): string {
  const cleaned = text.replace(/\s+/g, " ");
  for (const noun of ROLE_NOUNS) {
    const re = new RegExp(`([\\w-]+(?:\\s+[\\w-]+){0,3}\\s+)?\\b${noun}s?\\b`, "i");
    const m = cleaned.match(re);
    if (!m) continue;
    let phrase = m[0];
    // Drop leading connectives the sentence used to introduce the title.
    phrase = phrase.replace(/^(?:\s*(?:as|a|an|the|new|our|is|be|will|joining|join|for)\b\s*)+/gi, "");
    phrase = phrase.replace(/^[^A-Za-z]+/, "").trim();
    if (phrase) return titleCase(phrase);
  }
  return "";
}

/** Best-effort full name — a safety net only; the agent should pass `name`. */
export function extractName(text: string): string {
  const m = text.match(
    /\b(?:add|onboard|hire|register|create|new hire|new employee|employee)\b[:\s-]*((?:[A-Z][a-z'’-]+)(?:\s+[A-Z][a-z'’-]+){0,2})/
  );
  if (m) return m[1].trim();
  const generic = text.match(/\b([A-Z][a-z'’-]+\s+[A-Z][a-z'’-]+)\b/);
  return generic ? generic[1].trim() : "";
}

// ---------------------------------------------------------------- derivation

/**
 * Snap a department onto one already in use, so the agent can't quietly create
 * "eng" alongside "Engineering". Falls back to an alias, then to title case.
 */
export function normalizeDepartment(raw: string, known: string[]): { value: string; note?: string } {
  const v = raw.trim();
  if (!v) return { value: "" };
  const lower = v.toLowerCase();

  const exact = known.find((k) => k.toLowerCase() === lower);
  if (exact) return { value: exact };

  const alias = DEPT_ALIASES[lower];
  if (alias) {
    const onRoster = known.find((k) => k.toLowerCase() === alias.toLowerCase());
    return { value: onRoster ?? alias, note: `matched "${v}" to ${onRoster ?? alias}` };
  }

  const prefix = known.find((k) => k.toLowerCase().startsWith(lower) || lower.startsWith(k.toLowerCase()));
  if (prefix) return { value: prefix, note: `matched "${v}" to existing department ${prefix}` };

  return { value: titleCase(v), note: `no existing department matches "${v}" — this creates a new one` };
}

/** Next free EMP id, one above the highest currently on the roster. */
export function nextEmployeeId(existing: string[]): string {
  const highest = existing.reduce((max, id) => {
    const n = Number(String(id).replace(/\D/g, ""));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `EMP${String(highest + 1).padStart(3, "0")}`;
}

/** House-style work email from a name, e.g. Priya Sharma → priya.sharma@... */
export function emailFromName(name: string, domain: string): string {
  const parts = name
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  const local = (parts.length === 1 ? parts[0] : `${parts[0]}.${parts[parts.length - 1]}`).replace(/['-]/g, "");
  return `${local}@${domain}`;
}

/**
 * Pull a department out of prose, preferring one the company already uses over
 * anything new. `known` comes from the live roster.
 */
export function extractDepartment(text: string, known: string[]): string {
  const lower = text.toLowerCase();
  const onRoster = known.find((d) => d && lower.includes(d.toLowerCase()));
  if (onRoster) return onRoster;

  const alias = Object.keys(DEPT_ALIASES).find((k) =>
    // Two-letter shorthand ("it", "hr", "qa") is only safe when the admin wrote
    // it capitalised — otherwise "when it suits" would resolve to the IT team.
    k.length <= 2
      ? new RegExp(`\\b${k.toUpperCase()}\\b`).test(text)
      : new RegExp(`\\b${k}\\b`, "i").test(text)
  );
  if (alias) return DEPT_ALIASES[alias];

  // "... in the Platform team", "... in Growth,"
  const phrase = text.match(
    /\bin\s+(?:the\s+)?([A-Za-z][A-Za-z&\s]{1,28}?)(?:\s+(?:team|department|dept|division)\b|[,.;]|$)/i
  );
  return phrase ? phrase[1].trim() : "";
}

/** Most common email domain on the roster, so inferred emails match the company. */
export function inferDomain(emails: string[], fallback = "dayflow.com"): string {
  const counts = new Map<string, number>();
  for (const e of emails) {
    const at = String(e ?? "").split("@")[1];
    if (at) counts.set(at.toLowerCase(), (counts.get(at.toLowerCase()) ?? 0) + 1);
  }
  let best = fallback;
  let bestCount = 0;
  counts.forEach((count, domain) => {
    if (count > bestCount) { best = domain; bestCount = count; }
  });
  return best;
}
