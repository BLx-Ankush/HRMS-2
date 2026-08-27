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

Read tools (no approval needed):

- `list_employees` — search/filter the roster by text, department, or status
- `get_employee` — full profile by employee ID
- `list_leave_requests` — find requests (and their IDs) by status

Write tools (each gated by human approval):

- `add_employee` — add a full employee record (all fields)
- `update_employee` — patch any subset of an employee's fields
- `decide_leave` — approve or reject a pending leave request

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
- **`tools.ts`** — the admin tool set, reusing the app's own data layer.
- **`useWebMcpTools.ts`** — registers tools only while an **admin** is signed in and tears
  them down via `AbortController` on logout/role change (employees never get write tools).
- **`agentClient.ts` + `AgentPanel.tsx`** — an in-page, **bring-your-own-key** agent so the
  cooperative flow is reproducible for any judge, in any browser, with **no secret shipped
  in the frontend**. The key is sent directly from the browser to OpenAI and stored only
  locally.

## Security model

- **Admin-gated tools.** Write tools are registered only for the admin role and unregistered
  on logout via `AbortController`.
- **Human approval on every write.** Nothing mutates without an explicit Confirm.
- **No secrets in the frontend.** The in-page agent is bring-your-own-key; the native path
  uses the browser's own agent, so no API key ships in our bundle.
- **RLS-backed data.** Only the public `anon` key reaches the browser (Vite `VITE_` vars);
  the `service_role` secret is server-only and never committed.

## Mapping to the judging criteria

- **Innovation** — WebMCP tools mounted on a *real, live* app rather than a toy, with a
  dual surface (native `document.modelContext` + an in-page mirror) so the same tools work
  whether or not the browser has shipped WebMCP yet.
- **Execution** — Agent and human share one code path; realtime cache invalidation means
  agent actions are instantly visible; tools are typed with JSON-Schema inputs and defensive
  error handling; lifecycle is cleanly tied to auth via `AbortController`.
- **Creativity** — The "agent drafts, human commits" approval dialog turns an LLM into a
  safe co-pilot for HR operations, not an unsupervised actor.
- **Potential impact** — HR admins spend hours on roster edits and leave triage; a
  cooperative agent that proposes changes and waits for one click is directly deployable and
  generalizes to any CRUD-style internal tool.

## Try it

1. Open the live app and sign in as **admin** (`admin@dayflow.com` / `admin123`).
2. **Native path:** open the app in an agent-capable browser (ChatGPT in-app browser) and
   ask it to, e.g., *"Add Priya Sharma (EMP007) to Engineering as a Backend Developer"* or
   *"Approve the pending leave for EMP002."* Confirm in the dialog that appears.
3. **Any browser:** click the floating bot button (bottom-right), paste an OpenAI API key in
   Settings, and ask the same things. Watch the approval dialog gate each write and the UI
   update live.

## Non-goals

Headless/autonomous automation. Dayflow deliberately keeps a human in the loop for every
change — the agent accelerates the work, the admin stays in control.
