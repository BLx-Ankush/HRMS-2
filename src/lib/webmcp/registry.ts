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
  /** Names the native surface has actually accepted. Re-registering one of these
   *  is a rejection, so this is what makes republishing idempotent. */
  private nativeNames = new Set<string>();
  private listeners = new Set<Listener>();
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private lastSignal?: AbortSignal;
  private status: WebMcpStatus = {
    nativeAvailable: false, surface: null, method: null,
    toolCount: 0, nativeToolCount: 0, lastError: null,
  };

  /** Register a batch of tools. Returns an unregister function. Honors an
   *  optional AbortSignal so callers can tie tool lifetime to auth state. */
  register(descriptors: McpToolDescriptor[], signal?: AbortSignal): () => void {
    descriptors.forEach((d) => this.tools.set(d.name, d));
    this.lastSignal = signal;
    this.publishNative(signal);
    this.status.toolCount = this.tools.size;
    // ChatGPT's in-app browser (and origin-trial agents) inject the surface
    // when their agent ATTACHES to the page — which is typically after this
    // React app has mounted and registered once. So if the surface isn't here
    // yet, keep watching and (re)publish the moment it appears.
    if (!this.status.nativeAvailable) this.startNativeWatch();
    this.emit();

    const unregister = () => {
      descriptors.forEach((d) => this.tools.delete(d.name));
      this.status.toolCount = this.tools.size;
      this.retractNative(descriptors.map((d) => d.name));
      if (this.tools.size === 0) this.stopNativeWatch();
      this.emit();
    };
    if (signal) signal.addEventListener("abort", unregister, { once: true });
    return unregister;
  }

  /** Poll for a late-injected native surface; re-publish and stop once found. */
  private startNativeWatch() {
    if (this.watchTimer || typeof window === "undefined") return;
    this.watchTimer = setInterval(() => {
      if (this.lastSignal?.aborted) { this.stopNativeWatch(); return; }
      if (detectSurface()) {
        this.publishNative(this.lastSignal);
        this.stopNativeWatch();
        this.emit();
      }
    }, 1000);
  }

  private stopNativeWatch() {
    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
    }
  }

  /** Hand the current tool set to the browser, whatever shape it accepts.
   *
   *  `registerTool` is ASYNC: per spec it returns a promise that rejects if the
   *  name is already registered, if name/description are empty, or if the input
   *  schema is invalid. A try/catch alone therefore sees nothing — the earlier
   *  version of this method counted every call as a success and swallowed the
   *  rejection, so the status badge could claim tools were live when the browser
   *  had refused them. We settle each promise, count only the ones that resolve,
   *  and surface the first rejection reason.
   *
   *  Names already accepted by the native surface are skipped, because
   *  re-registering an existing name is itself a rejection: on a role change we
   *  would otherwise "re-publish" 25 tools and record 25 duplicate-name errors. */
  private publishNative(signal?: AbortSignal) {
    const found = detectSurface();
    this.status.nativeAvailable = !!found;
    this.status.surface = found?.surface ?? null;
    if (!found) return; // mirror-only is a valid state

    const { mc } = found;
    const all = Array.from(this.tools.values());

    if (typeof mc.registerTool === "function") {
      this.status.method = "registerTool";
      for (const d of all) {
        if (this.nativeNames.has(d.name)) continue;
        // Claim the name up front so a second publish in the same tick cannot
        // register it twice; released again if the browser rejects it.
        this.nativeNames.add(d.name);
        try {
          // Passing the options object is safe on builds that ignore a second
          // argument, and on builds that honor it the AbortSignal is what
          // removes the tool again on logout.
          const ret = mc.registerTool(d, signal ? { signal } : undefined);
          Promise.resolve(ret).then(
            () => {
              this.status.nativeToolCount = this.nativeNames.size;
              this.emit();
            },
            (err: unknown) => {
              this.nativeNames.delete(d.name);
              this.status.nativeToolCount = this.nativeNames.size;
              this.status.lastError = `${d.name}: ${err instanceof Error ? err.message : String(err)}`;
              this.emit();
            },
          );
        } catch (err) {
          this.nativeNames.delete(d.name);
          this.status.lastError = `${d.name}: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      this.status.nativeToolCount = this.nativeNames.size;
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

  /** Drop names from the native surface so they can be re-registered later.
   *  The spec's teardown is the AbortSignal we passed at registration; this also
   *  calls `unregisterTool` when the build exposes it, and clears our own record
   *  either way so a later publish is not treated as a duplicate. */
  private retractNative(names: string[]) {
    const mc = detectSurface()?.mc;
    for (const name of names) {
      if (!this.nativeNames.delete(name)) continue;
      try {
        mc?.unregisterTool?.(name);
      } catch {
        // Older builds have no unregisterTool; the AbortSignal covers those.
      }
    }
    this.status.nativeToolCount = this.nativeNames.size;
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
