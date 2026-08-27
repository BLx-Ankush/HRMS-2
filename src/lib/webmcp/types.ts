// Ambient typings for the WebMCP imperative API (document.modelContext).
// The API is an experimental W3C Community Group draft; these declarations are
// intentionally minimal and permissive so our adapter can feature-detect and
// degrade gracefully in browsers that haven't shipped it yet.
export {};

export interface McpContentBlock {
  type: "text";
  text: string;
}

export interface McpToolResult {
  content: McpContentBlock[];
  isError?: boolean;
}

export interface McpToolDescriptor {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<McpToolResult>;
}

export interface McpRegisterOptions {
  signal?: AbortSignal;
}

interface ModelContext {
  registerTool?: (
    descriptor: McpToolDescriptor,
    options?: McpRegisterOptions
  ) => unknown;
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
