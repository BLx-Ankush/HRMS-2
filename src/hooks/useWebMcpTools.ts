import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { webmcp } from "@/lib/webmcp/registry";
import { buildAdminTools } from "@/lib/webmcp/tools";

/**
 * Registers the admin WebMCP tool set while an admin is signed in, and tears it
 * down (via AbortController) on logout or role change. Tools are exposed both to
 * the browser's native `document.modelContext` (when present) and to the in-page
 * Agent panel through the shared registry. Mount one instance high in the tree.
 */
export function useWebMcpTools() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return; // admin-gated: employees don't get write tools
    const controller = new AbortController();
    webmcp.register(buildAdminTools(qc), controller.signal);
    return () => controller.abort();
  }, [isAdmin, qc]);
}

/** Renderless component that activates the WebMCP tool set for its subtree. */
export function WebMcpTools() {
  useWebMcpTools();
  return null;
}
