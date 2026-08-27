import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { canvas } from "@/lib/webmcp/canvas";
import { useCanvas } from "@/hooks/useCanvas";

/**
 * Renderless bridge that lets agent tool calls drive real router navigation.
 *
 * Tools cannot call `useNavigate` (they aren't components, and the WebMCP tool
 * set is registered above <BrowserRouter/>), so they publish a pending route to
 * the canvas store instead. This component lives INSIDE the router, performs the
 * navigation, and reports the settled route back so `get_page_context` always
 * knows which screen the human is on.
 */
export function CanvasBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const { pendingRoute } = useCanvas();

  // Honor agent-requested navigation.
  useEffect(() => {
    if (!pendingRoute) return;
    if (pendingRoute !== location.pathname) navigate(pendingRoute);
    canvas.routeSettled(pendingRoute);
  }, [pendingRoute, location.pathname, navigate]);

  // Keep the canvas's notion of "current screen" truthful for human navigation too.
  useEffect(() => {
    canvas.routeSettled(location.pathname);
  }, [location.pathname]);

  return null;
}
