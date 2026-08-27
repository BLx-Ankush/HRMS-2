// WebMCP registry + shim.
//
// This is the single place that talks to the (experimental) native
// `document.modelContext` API. It does two jobs at once:
//
//   1. Registers each tool with the browser's native WebMCP surface when it
//      exists, so ChatGPT's in-app browser / Chrome's built-in agent can call
//      them. Registration is defensive: the exact native signature is still in
//      flux, so we try the options-arg form and fall back to a descriptor-only
//      call, and never throw if the API is missing or shaped differently.
//
//   2. Keeps a local mirror of the same tools so our in-page Agent panel can
//      list and invoke them via getTools()/executeTool() in ANY browser,
//      regardless of native support. This guarantees the cooperative demo is
//      reproducible for anyone who opens the public URL.
import type { McpToolDescriptor, McpToolResult } from "./types";

type Listener = () => void;

class WebMcpRegistry {
  private tools = new Map<string, McpToolDescriptor>();
  private listeners = new Set<Listener>();

  /** Register a batch of tools. Returns an unregister function. Also honors an
   *  optional AbortSignal so callers can tie lifetime to auth/session state. */
  register(descriptors: McpToolDescriptor[], signal?: AbortSignal): () => void {
    descriptors.forEach((d) => {
      this.tools.set(d.name, d);
      this.registerNative(d, signal);
    });
    this.emit();

    const unregister = () => {
      descriptors.forEach((d) => this.tools.delete(d.name));
      this.emit();
    };
    if (signal) signal.addEventListener("abort", unregister, { once: true });
    return unregister;
  }

  private registerNative(d: McpToolDescriptor, signal?: AbortSignal) {
    // The spec's surface has moved over time. Current Chrome / ChatGPT expose it
    // as navigator.modelContext; older drafts used document.modelContext. Try the
    // current one first, then fall back, so we're discovered on either build.
    const mc =
      (typeof navigator !== "undefined" ? navigator.modelContext : undefined) ??
      (typeof document !== "undefined" ? document.modelContext : undefined);
    if (!mc?.registerTool) return; // no native surface — mirror-only is fine
    try {
      // Preferred: descriptor + options (with AbortSignal for teardown).
      mc.registerTool(d, signal ? { signal } : undefined);
    } catch {
      try {
        // Fallback: some builds accept the signal inside the descriptor.
        mc.registerTool({ ...d, ...(signal ? { signal } : {}) } as McpToolDescriptor);
      } catch {
        /* swallow — mirror still works for the in-page panel */
      }
    }
  }

  /** Tool metadata for the in-page Agent panel and for LLM tool-calling. */
  list() {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  has(name: string) {
    return this.tools.has(name);
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
