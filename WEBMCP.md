# Dayflow HRMS — WebMCP Challenge Submission

**A live HR console that a browser-native AI agent can safely operate — with a human
in the loop for every change.**

- **Live app:** https://hrms-2-virid.vercel.app
- **Repo:** https://github.com/BLx-Ankush/HRMS-2
- **License:** MIT (see [LICENSE](./LICENSE))
- **Category:** WebMCP Challenge (cooperative human + agent web workflows)

---

## What it is

Dayflow is a real, production-style Human Resource Management System (React + TypeScript +
Supabase) where **every page reads and writes live data** — no mock arrays. On top of that
real app, we expose the admin's day-to-day workflows as **WebMCP tools** registered on
`document.modelContext`, so a browser-native agent (e.g. the ChatGPT in-app browser or a
Chrome/Edge origin-trial build) can *drive the actual application* the same way a human
admin would.

The defining choice: **agents draft, humans commit.** Every mutating tool pauses on an
in-page approval dialog that shows exactly what will change. The agent proposes; the admin
clicks Confirm. That is the cooperative pattern the WebMCP brief rewards — not a headless
bot acting on its own.

## What the agent can do

**28 tools**, scoped by role: every signed-in user gets the page-state and own-record tools;
the roster, leave, verification, bonus and salary tools are registered **only** for admins, so
an employee's agent cannot even see them.

### Tools a server-side API could not provide

These are the reason this is a WebMCP submission and not a REST integration. Each one reads
or writes state that exists **only inside the human's live tab**:

| Tool | Why no API can do this |
| --- | --- |
| `get_page_context` | Returns the screen the human is actually on, their filters, the row they have expanded, and what the agent has drawn — live React state, not database rows |
| `navigate_to` / `focus_employee` / `filter_directory` | Actuate the human's own UI: change route, scroll and highlight a row, apply directory filters. The agent works *on the page with you*, not behind it |
| `read_contribution_import` | Reads a work-export file the HR user dropped onto the page. It was parsed in the tab and **never uploaded** — there is no URL a server could fetch |
| `propose_bonus_pool` / `get_award_shortlist` | Compute a payout split or award shortlist and **draw it on HR's screen** as an unsaved proposal |
| `record_bonus_decision` | Takes **no amounts as arguments** — it commits the proposal held in live page state, so an agent cannot pay out a figure the human never saw |
| `propose_salary_structure` | Derives a full component breakdown from a target CTC or a raise and **draws it on the Salary Structure page**, each line beside its current value and the arithmetic that produced it |
| `commit_salary_structure` | Also takes **no amounts** — it writes the breakdown rendered in live page state, so the figure that reaches payroll is always the figure a human read on screen |

### Read tools

- `get_policy`, `get_scoring_model`, `get_salary_model` — the company's own rules, so the agent
  quotes policy (and the real component split and PF rates) instead of inventing it
- `list_employees`, `get_employee`, `list_leave_requests`, `get_compensation`
- `get_capacity_matrix`, `check_leave_coverage` — deterministic simulation of who would be
  left covering what if a leave request were approved
- `get_contribution_scores` — ranked contribution board with the arithmetic behind every
  point, plus points blocked behind unverified claims
- `get_my_contributions` — an employee's own score, rank, evidence and what HR still owes them

### Write tools (each gated by in-page human approval)

- `add_employee` — a full employee record
- `add_employee_from_description` — onboard from one sentence of prose; the next free employee
  ID, the department (snapped onto one already in use), a house-style work email and the join
  date are derived against the live roster, duplicates are caught before anything is written,
  and the draft marks which values were **stated** versus **inferred**
- `update_employee`, `decide_leave`
- `log_contribution` — file your own work as a claim; filing under someone else's ID is refused
- `verify_contribution` — HR verifies or rejects a claim; only verified rows ever score
- `review_pending_contributions` — highlights the unreviewed backlog on HR's screen
- `propose_salary_structure` — derive a full breakdown from intent alone ("18 lakh", "12%") and
  draw it, unsaved, on HR's Salary Structure page; the agent may not pass component amounts
- `commit_salary_structure` — saves the breakdown on screen, nothing else
- `record_bonus_decision` — the only tool that commits money

Because the tools call the **exact same Supabase logic the UI hooks use**
(`src/hooks/hrms.ts`), an agent action and a human action travel identical paths and both
trigger the same React Query cache invalidation and realtime sync — so the moment a tool
runs, every open tab updates live. There is no separate "agent backend" to drift out of
sync with the UI.

## How it works (architecture)

```
Browser agent (ChatGPT in-app browser / Chrome origin trial)
        │  document.modelContext.registerTool / executeTool
        ▼
  WebMCP registry  ── mirrors every tool locally ──► In-page Agent panel (BYO-key)
        │                                                    (works in ANY browser)
        ▼
   Tool.execute()  ──►  requireApproval()  ──►  <AgentApprovalDialog/>  (human confirms)
        │                                                    │
        ▼                                                    ▼
   Supabase (Postgres + Auth + RLS)  ◄── same code path as the UI hooks
```

Key pieces (all under `src/lib/webmcp/` and `src/components/`):

- **`registry.ts`** — the single adapter that talks to the experimental native
  `document.modelContext` API. It registers each tool natively when the browser supports
  it, and *always* keeps a local mirror so the in-page panel can list/execute the same
  tools in any browser. Native registration is defensive (tries the options-arg form, falls
  back, never throws) so the demo survives signature drift in a spec that's still evolving.
- **`approval.ts` + `AgentApprovalDialog.tsx`** — the human-in-the-loop bridge. A mutating
  tool calls `requireApproval()`, which returns a Promise that resolves only when the admin
  clicks Confirm/Cancel. This works identically for the native agent and the in-page panel.
- **`tools.ts`** — the admin roster/leave tool set, reusing the app's own data layer.
- **`canvas.ts` + `useCanvas.ts` + `CanvasBridge.tsx`** — the **shared canvas**. Tool calls
  write intents (route, highlighted rows, focused contributor, a proposed bonus plan) into an
  external store; live components read it through `useSyncExternalStore`, so an agent's tool
  call visibly moves the human's screen. Tools are registered above `<BrowserRouter/>` and so
  cannot call `useNavigate` — `CanvasBridge` lives inside the router and performs the
  navigation, then reports the settled route back so `get_page_context` stays truthful.
- **`contributionScore.ts`** — the scoring engine. Pure, deterministic, and decomposed: every
  tool response carries the per-row arithmetic (`type weight × impact weight`), the tie-break
  order, and a published disclosure of what the score **cannot** see.
- **`importContributions.ts`** — a CSV/TSV/JSON work-export parser that runs entirely in the
  tab. The store is deliberately not persisted: closing the tab discards the file, which is
  the correct privacy behaviour.
- **`bonusTools.ts`** — contribution and bonus tools, split into an everyone-tier and an
  admin-tier builder.
- **`salaryModel.ts` + `salaryTools.ts` + `SalaryProposalPanel.tsx`** — the salary path. The
  model is pure and published (`get_salary_model`), so the agent contributes *intent* — a
  target CTC or a raise percentage — and never a rupee figure: basic, HRA, LTA, performance,
  standard and fixed allowance, PF both sides and professional tax are all derived here from
  the company's own configured rates, each line carrying the arithmetic that produced it.
  `propose_salary_structure` draws the result unsaved beside the current figures;
  `commit_salary_structure` accepts no amounts and writes only what is on screen.
- **`useWebMcpTools.ts`** — registers the role-appropriate tool set while a user is signed in
  and tears it down via `AbortController` on logout/role change.
- **`agentClient.ts` + `AgentPanel.tsx`** — an in-page, **bring-your-own-key** agent so the
  cooperative flow is reproducible for any judge, in any browser, with **no secret shipped
  in the frontend**. The key is sent directly from the browser to OpenAI and stored only
  locally.

## The bonus feature, and what it deliberately does not claim

The Bonuses page tracks what people actually did — contributions logged in-app or imported
from a work export — and turns verified evidence into a score HR can defend line by line.
An agent can read the board, propose a split, and draw it on HR's screen; only a person can
record it.

Two honest framings ship with it, in the UI *and* in every tool response:

- The score is **auditable, not unbiased**. It can only see work that was logged and
  human-verified, so it under-counts invisible work and anyone whose claims are sitting
  unreviewed. Those blocked points are reported as a first-class number rather than hidden.
- **Only `verified` rows score.** A claim is worth zero until a human accepts the evidence,
  which keeps the scoreboard from becoming a self-service leaderboard.

## Security model

- **Role-scoped tools.** Write, verification, bonus and salary tools are registered only for the
  admin role and unregistered on logout via `AbortController`.
- **Human approval on every write.** Nothing mutates without an explicit Confirm.
- **The money tools cannot invent a number.** `record_bonus_decision` and
  `commit_salary_structure` take no amounts; each commits only what is already rendered on the
  human's screen, and the approval dialog shows every component old against new.
- **The imported file never leaves the browser.** It is parsed in-tab and held in memory only.
- **No secrets in the frontend.** The in-page agent is bring-your-own-key; the native path
  uses the browser's own agent, so no API key ships in our bundle.
- **RLS-backed data.** Only the public `anon` key reaches the browser (Vite `VITE_` vars);
  the `service_role` secret is server-only and never committed.

## Mapping to the judging criteria

- **WebMCP leverage** — the tool set is built around capabilities that are *only* possible
  in-page: reading live React state, reading a file that was never uploaded, actuating the
  human's own UI, and committing only what is currently displayed. Dual surface (native
  `document.modelContext` + an in-page mirror) means the same tools work whether or not the
  browser has shipped WebMCP yet.
- **Execution** — agent and human share one code path; realtime cache invalidation makes agent
  actions instantly visible in every tab; tools are typed with JSON-Schema inputs, return
  decomposed arithmetic rather than bare numbers, and handle errors defensively; lifecycle is
  cleanly tied to auth via `AbortController`.
- **Potential impact** — roster edits, leave triage, and bonus/award decisions are hours of
  real HR work a week. The pattern generalises to any internal tool where a human must stay
  accountable for the outcome: the agent does the reading, arithmetic and drafting; the human
  keeps the decision.
- **Creativity & ambition** — "agent drafts on your screen, human commits" applied to the
  hardest case, money. Plus a scoring model that publishes its own limitations instead of
  hiding behind an algorithm.

## Try it

1. Open the live app and sign in as **admin** (`admin@dayflow.com` / `admin123`).
2. **Native path:** open the app in an agent-capable browser (Chrome with
   `chrome://flags/#enable-webmcp-testing`, or the ChatGPT in-app browser). Registration is
   visible in DevTools → Application → WebMCP. Ask it to, e.g., *"Add Priya Sharma to
   Engineering as a Backend Developer"*, *"Should I approve EMP002's leave?"*, or
   *"Split a ₹200,000 bonus pool across the last quarter's verified contributions."*
   Confirm in the dialog that appears.
3. **Any browser:** click the floating bot button (bottom-right), paste an OpenAI API key in
   Settings, and ask the same things. Watch the agent navigate your screen, draw its proposal,
   and stop at the approval dialog.
4. **The in-tab file trick:** drop a CSV or JSON work export onto the import card on the
   Bonuses page, then ask the agent *"what's in the file I just loaded?"* — it can read it,
   and nothing was uploaded anywhere.
5. **Salary, from intent only:** ask *"put EMP007 on a CTC of 18 lakh"* or *"give EMP003 a 12%
   raise"*. The breakdown appears on the Salary Structure page — every component beside its
   current value, with the arithmetic — and stays unsaved until you (or a follow-up
   *"save it"*, which routes through the approval dialog) commit exactly what is displayed.

## Non-goals

Headless/autonomous automation. Dayflow deliberately keeps a human in the loop for every
change — the agent accelerates the work, the human keeps the decision.
