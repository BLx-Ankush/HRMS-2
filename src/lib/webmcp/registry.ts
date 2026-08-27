// WebMCP registry + adapter.
//
// This is the ONLY place that talks to the experimental browser API. It does two
// jobs:
//
//   1. Registers every tool with the browser's native WebMCP surface so an
//      in-browser agent (ChatGPT's in-app browser "Site tools", Chrome/Edge
//      origin-trial agents, WebMCP-aware extensions) can discover and call them.
//      The surface is `document.modelContext` in current builds; older builds
//      used `navigator.modelContext`. We probe document first, then navigator,
//      and as a last resort fall back to `provideContext()` for builds that only
//      expose the whole-toolset API. Every call is wrapped so a shape mismatch
//      can never crash the app.
//
//   2. Keeps a local mirror of the same tools so the in-page Agent panel can
//      list and invoke them via list()/execute() in ANY browser. That keeps the
//      cooperative demo reproducible for anyone who opens the public URL.
//
// It also publishes a small status object so the UI can SHOW whether native
// registration actually succeeded — turning "did it work?" into an observable
// fact instead of guesswork.
import type { McpToolDescriptor, McpToolResult, ModelContext } from "./types";

type Listener = () => void;

export interface WebMcpStatus {
  /** True if a native modelContext object was found at all. */
  nativeAvailable: boolean;
  /** Which global exposed it. */
  surface: "document" | "navigator" | null;
  /** Which native method we used to publish tools. */
  method: "registerTool" | "provideContext" | null;
  /** Tools currently in the local mirror. */
  toolCount: number;
  /** Tools successfully handed to the native surface. */
  nativeToolCount: number;
  /** Last native error message, if any. */
  lastError: string | null;
}

/** Find the native surface, preferring the current `document` spelling. */
function detectSurface(): { mc: ModelContext; surface: "document" | "navigator" } | null {
  if (typeof document !== "undefined" && document.modelContext)
    return { mc: document.modelContext, surface: "document" };
  if (typeof navigator !== "undefined" && navigator.modelContext)
    return { mc: navigator.modelContext, surface: "navigator" };
  return null;
}

class WebMcpRegistry {
  private tools = new Map<string, McpToolDescriptor>();
  private listeners = new Set<Listener>();
  private status: WebMcpStatus = {
    nativeAvailable: false, surface: null, method: null,
    toolCount: 0, nativeToolCount: 0, lastError: null,
  };

  /** Register a batch of tools. Returns an unregister function. Honors an
   *  optional AbortSignal so callers can tie tool lifetime to auth state. */
  register(descriptors: McpToolDescriptor[], signal?: AbortSignal): () => void {
    descriptors.forEach((d) => this.tools.set(d.name, d));
    this.publishNative(signal);
    this.status.toolCount = this.tools.size;
    this.emit();

    const unregister = () => {
      descriptors.forEach((d) => this.tools.delete(d.name));
      this.status.toolCount = this.tools.size;
      this.status.nativeToolCount = 0;
      this.emit();
    };
    if (signal) signal.addEventListener("abort", unregister, { once: true });
    return unregister;
  }

  /** Hand the current tool set to the browser, whatever shape it accepts. */
  private publishNative(signal?: AbortSignal) {
    const found = detectSurface();
    this.status.nativeAvailable = !!found;
    this.status.surface = found?.surface ?? null;
    if (!found) return; // mirror-only is a valid state

    const { mc } = found;
    const all = Array.from(this.tools.values());

    if (typeof mc.registerTool === "function") {
      let ok = 0;
      for (const d of all) {
        try {
          // Current shape: a single descriptor argument.
          mc.registerTool(d);
          ok++;
        } catch (first) {
          try {
            // Some origin-trial builds accept (descriptor, { signal }).
            mc.registerTool(d, signal ? { signal } : undefined);
            ok++;
          } catch (second) {
            this.status.lastError = second instanceof Error ? second.message : String(second);
          }
        }
      }
      this.status.method = "registerTool";
      this.status.nativeToolCount = ok;
      return;
    }

    if (typeof mc.provideContext === "function") {
      try {
        // Whole-toolset API: try the documented { tools } wrapper, then a bare array.
        try {
          mc.provideContext({ tools: all });
        } catch {
          mc.provideContext(all);
        }
        this.status.method = "provideContext";
        this.status.nativeToolCount = all.length;
      } catch (err) {
        this.status.lastError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  /** Tool metadata for the in-page Agent panel and for LLM tool-calling. */
  list() {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
      readOnly: t.annotations?.readOnlyHint === true,
    }));
  }

  has(name: string) {
    return this.tools.has(name);
  }

  /** Current native-registration status (for the on-page status badge). */
  snapshot(): WebMcpStatus {
    return this.status;
  }

  /** Invoke a tool by name through the local mirror. */
  async execute(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
    try {
      return await tool.execute(args ?? {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Tool "${name}" failed: ${msg}` }], isError: true };
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    // New object identity so useSyncExternalStore sees a change.
    this.status = { ...this.status };
    this.listeners.forEach((fn) => fn());
  }
}

/** App-wide singleton. */
export const webmcp = new WebMcpRegistry();

/** Small helpers for building MCP results. */
export const textResult = (text: string): McpToolResult => ({ content: [{ type: "text", text }] });
export const jsonResult = (data: unknown): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});
