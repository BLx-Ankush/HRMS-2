import { useSyncExternalStore } from "react";
import { canvas, type CanvasState } from "@/lib/webmcp/canvas";

/** Subscribe a component to the shared human/agent canvas. */
export function useCanvas(): CanvasState {
  return useSyncExternalStore(canvas.subscribe, canvas.getSnapshot, canvas.getSnapshot);
}
