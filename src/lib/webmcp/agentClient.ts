// Minimal in-page agent loop (bring-your-own-key).
//
// This drives the SAME WebMCP tools the native agent uses, but from an OpenAI
// chat-completions loop the user powers with their own key. Nothing is ever
// bundled: the key lives only in the browser (localStorage) and is sent
// directly to OpenAI from the client. Because tool execution goes through the
// shared registry, mutating tools still pause on <AgentApprovalDialog/> — the
// cooperative "agent drafts, human commits" flow works in any browser.
import { webmcp } from "./registry";

export interface ChatMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** assistant tool-call requests (OpenAI shape) */
  tool_calls?: OpenAiToolCall[];
  /** for role:"tool" — which call this answers */
  tool_call_id?: string;
  name?: string;
}

interface OpenAiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const KEY_STORAGE = "hrms.agent.openai_key";
const MODEL_STORAGE = "hrms.agent.model";
const BASE_URL_STORAGE = "hrms.agent.base_url";

export const loadKey = () => localStorage.getItem(KEY_STORAGE) ?? "";
export const saveKey = (k: string) => localStorage.setItem(KEY_STORAGE, k);
export const loadModel = () => localStorage.getItem(MODEL_STORAGE) ?? "gpt-4o-mini";
export const saveModel = (m: string) => localStorage.setItem(MODEL_STORAGE, m);
export const loadBaseUrl = () => localStorage.getItem(BASE_URL_STORAGE) ?? DEFAULT_BASE_URL;
export const saveBaseUrl = (u: string) => localStorage.setItem(BASE_URL_STORAGE, u);

/** Where the agent's model lives. Any OpenAI-compatible endpoint works. */
export interface AgentConfig {
  key: string;
  model: string;
  /** Base like "https://proxy.example.com/v1", or a full chat-completions URL. */
  baseUrl: string;
}

/**
 * Turn whatever the admin typed into a chat-completions URL. Accepts a bare
 * base ("…/v1"), a base with a trailing slash, or an already-complete endpoint
 * ("…/v1/chat/completions") so proxy users can paste either form.
 */
export function resolveEndpoint(baseUrl: string): string {
  const base = (baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

export const SYSTEM_PROMPT =
  "You are the HRMS admin assistant. Use the provided tools to read and modify " +
  "HR data. For any change (adding/updating an employee, deciding a leave request), " +
  "call the appropriate tool — a human admin will be asked to confirm before it is " +
  "saved, so you do not need to ask for confirmation yourself. Look up IDs with the " +
  "list_* tools before acting. Be concise and report what actually happened.";

/** Map the registry's tool metadata into OpenAI function-tool descriptors. */
function openAiTools() {
  return webmcp.list().map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

interface RunResult {
  /** Full transcript after the turn (system message stripped). */
  messages: ChatMsg[];
  /** Human-readable note about each tool the agent invoked. */
  toolNotes: string[];
}

async function callChatCompletions(cfg: AgentConfig, messages: ChatMsg[]) {
  const url = resolveEndpoint(cfg.baseUrl);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        tools: openAiTools(),
        tool_choice: "auto",
        temperature: 0.2,
      }),
    });
  } catch (e) {
    // Most common cause with a custom base URL: the proxy doesn't send CORS
    // headers for browser origins, so the request never leaves the page.
    throw new Error(
      `Could not reach ${url}. If this is a proxy, check the URL and that it ` +
        `allows browser requests (CORS). Original error: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${url} → ${res.status}: ${detail.slice(0, 300) || res.statusText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message as {
    content: string | null;
    tool_calls?: OpenAiToolCall[];
  };
}

/**
 * Run one user turn: repeatedly call the model and execute any tool calls it
 * requests (through the shared registry, so approvals still gate writes) until
 * it returns a plain text answer. Bounded by maxSteps to avoid runaway loops.
 */
export async function runAgentTurn(
  cfg: AgentConfig,
  history: ChatMsg[],
  maxSteps = 6
): Promise<RunResult> {
  const messages = [...history];
  const toolNotes: string[] = [];

  for (let step = 0; step < maxSteps; step++) {
    const reply = await callChatCompletions(cfg, messages);
    const toolCalls = reply.tool_calls ?? [];

    messages.push({
      role: "assistant",
      content: reply.content ?? "",
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    });

    if (!toolCalls.length) break; // final answer

    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* leave empty on malformed args */
      }
      const result = await webmcp.execute(call.function.name, args);
      const text = result.content.map((c) => c.text).join("\n");
      toolNotes.push(`${call.function.name}(${JSON.stringify(args)}) → ${text}`);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: text,
      });
    }
  }

  return { messages, toolNotes };
}

