import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { webmcp } from "@/lib/webmcp/registry";
import { buildAdminTools } from "@/lib/webmcp/tools";
import { buildCanvasTools } from "@/lib/webmcp/canvasTools";

/**
 * Publishes the WebMCP tool set for the signed-in user, and tears it down (via
 * AbortController) on logout or role change.
 *
 * Capability scoping is real: every signed-in user gets the browser-native
 * canvas tools (page-state reads, UI actuation, policy lookup, coverage
 * simulation), while the mutating roster/leave tools are registered ONLY for
 * admins. An employee's agent therefore literally cannot see the write tools —
 * governance enforced at the protocol surface, not just in a handler.
 *
 * Tools are exposed both to the browser's native `document.modelContext` and to
 * the in-page Agent panel through the shared registry. Mount one instance high
 * in the tree.
 */
export function useWebMcpTools() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const role = user?.role === "admin" ? "admin" : "employee";
  const employeeId = user?.employeeId;
  const signedIn = !!user;

  useEffect(() => {
    if (!signedIn) return; // no tools for anonymous visitors
    const controller = new AbortController();
    const tools = [
      ...buildCanvasTools({ role, employeeId }),
      ...(role === "admin" ? buildAdminTools(qc) : []),
    ];
    webmcp.register(tools, controller.signal);
    return () => controller.abort();
  }, [signedIn, role, employeeId, qc]);
}

/** Renderless component that activates the WebMCP tool set for its subtree. */
export function WebMcpTools() {
  useWebMcpTools();
  return null;
}
