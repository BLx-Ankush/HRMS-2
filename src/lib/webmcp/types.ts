// Ambient typings for the WebMCP imperative API.
//
// The current surface is `document.modelContext` (per Chrome's docs, 2026);
// `navigator.modelContext` was the earlier spelling and is deprecated as of
// Chrome 150. We type BOTH and feature-detect at runtime, because the API is an
// experimental W3C Community Group draft and origin-trial builds differ.
export {};

export interface McpContentBlock {
  type: "text";
  text: string;
}

export interface McpToolResult {
  content: McpContentBlock[];
  isError?: boolean;
}

/** MCP tool annotations — hints agents use to decide how cautious to be. */
export interface McpToolAnnotations {
  /** Tool only reads; safe to call speculatively. */
  readOnlyHint?: boolean;
  /** Tool may destroy or overwrite data. */
  destructiveHint?: boolean;
  /** Calling twice with the same args has the same effect as once. */
  idempotentHint?: boolean;
}

export interface McpToolDescriptor {
  name: string;
  /** Short human-facing label (shown in some agent UIs). */
  title?: string;
  description: string;
  /** JSON Schema (draft-07 subset) for the tool's arguments. */
  inputSchema: Record<string, unknown>;
  annotations?: McpToolAnnotations;
  execute: (args: Record<string, unknown>) => Promise<McpToolResult>;
}

export interface McpRegisterOptions {
  signal?: AbortSignal;
}

export interface ModelContext {
  registerTool?: (
    descriptor: McpToolDescriptor,
    options?: McpRegisterOptions
  ) => unknown;
  /** Older/alternate API: replace the entire tool set at once. */
  provideContext?: (arg: unknown) => unknown;
  getTools?: () => unknown;
  executeTool?: (name: string, args: Record<string, unknown>) => Promise<McpToolResult>;
  addEventListener?: (type: string, cb: () => void) => void;
  removeEventListener?: (type: string, cb: () => void) => void;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
  interface Navigator {
    modelContext?: ModelContext;
  }
}
