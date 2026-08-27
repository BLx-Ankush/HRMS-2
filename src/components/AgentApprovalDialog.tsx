import { useSyncExternalStore } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { approvals } from "@/lib/webmcp/approval";

/**
 * Renders the human-approval prompt for agent-initiated writes. When a WebMCP
 * tool calls requireApproval(), this dialog surfaces the drafted action and its
 * fields; the admin clicks Confirm or Cancel and the tool's promise resolves.
 * Mount one instance high in the tree (alongside the tool registration).
 */
export function AgentApprovalDialog() {
  const current = useSyncExternalStore(
    (cb) => approvals.subscribe(cb),
    () => approvals.snapshot(),
    () => approvals.snapshot()
  );

  const open = current !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) approvals.resolveCurrent(false); }}>
      <DialogContent className="sm:max-w-md">
        {current && (
          <>
            <DialogHeader>
              <DialogTitle>{current.title}</DialogTitle>
              <DialogDescription>
                An agent is requesting this action. Review the details and confirm.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-2 text-sm font-medium">{current.summary}</p>
              <dl className="space-y-1 text-sm">
                {Object.entries(current.details).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="w-32 shrink-0 text-muted-foreground">{k}</dt>
                    <dd className="font-medium break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => approvals.resolveCurrent(false)}>
                Cancel
              </Button>
              <Button
                variant={current.destructive ? "destructive" : "default"}
                onClick={() => approvals.resolveCurrent(true)}
              >
                {current.confirmLabel ?? "Confirm"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
