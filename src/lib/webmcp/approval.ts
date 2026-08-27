// Human-approval bridge for agent-initiated writes.
//
// Every mutating tool routes through requireApproval(), which enqueues a
// proposal and returns a Promise that resolves only when the admin clicks
// Confirm (or Cancel) in <AgentApprovalDialog/>. This is the cooperative
// pattern the WebMCP brief rewards: the agent drafts, the human commits.
export interface ApprovalRequest {
  title: string;
  /** One-line human summary of the action, e.g. "Add employee Jane Doe (EMP007)". */
  summary: string;
  /** Field/value pairs shown to the admin before they confirm. */
  details: Record<string, string>;
  confirmLabel?: string;
  destructive?: boolean;
}

interface QueuedApproval extends ApprovalRequest {
  id: number;
  resolve: (approved: boolean) => void;
}

type Listener = () => void;

class ApprovalController {
  private queue: QueuedApproval[] = [];
  private listeners = new Set<Listener>();
  private seq = 0;

  request(req: ApprovalRequest): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.queue.push({ ...req, id: ++this.seq, resolve });
      this.emit();
    });
  }

  current(): QueuedApproval | null {
    return this.queue[0] ?? null;
  }

  resolveCurrent(approved: boolean) {
    const item = this.queue.shift();
    item?.resolve(approved);
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Stable snapshot for useSyncExternalStore. */
  snapshot(): QueuedApproval | null {
    return this.current();
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }
}

export const approvals = new ApprovalController();

export function requireApproval(req: ApprovalRequest): Promise<boolean> {
  return approvals.request(req);
}
