import { useState, useSyncExternalStore } from "react";
import { Plug, PlugZap, ChevronUp, ChevronDown } from "lucide-react";
import { webmcp } from "@/lib/webmcp/registry";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Small on-page badge showing whether the browser's native WebMCP surface picked
 * up our tools. This exists so "are the tools actually exposed?" is an
 * observable fact during testing and on camera during the demo — not a guess.
 * Admin-only: employees get tools too (their own record plus the page-state and
 * UI tools), but the registration diagnostics are an operator concern.
 */
export function WebMcpStatusBadge() {
  const { user } = useAuth();
  const status = useSyncExternalStore(
    (cb) => webmcp.subscribe(cb),
    () => webmcp.snapshot(),
    () => webmcp.snapshot()
  );
  const [open, setOpen] = useState(false);

  if (user?.role !== "admin") return null;

  const live = status.nativeAvailable && status.nativeToolCount > 0;
  const tools = webmcp.list();

  return (
    <div className="fixed bottom-6 left-6 z-40 max-w-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-sm transition ${
          live
            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
            : "border-amber-300 bg-amber-50 text-amber-900"
        }`}
        aria-expanded={open}
      >
        {live ? <PlugZap className="h-4 w-4" /> : <Plug className="h-4 w-4" />}
        <span>
          {live
            ? `WebMCP live · ${status.nativeToolCount} tools`
            : `WebMCP not detected · ${status.toolCount} tools ready`}
        </span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border bg-card p-3 text-xs shadow-lg">
          <dl className="mb-2 space-y-1">
            <Row label="Surface" value={status.surface ? `${status.surface}.modelContext` : "none found"} />
            <Row label="Method" value={status.method ?? "—"} />
            <Row label="Registered" value={`${status.nativeToolCount} / ${status.toolCount}`} />
            {status.lastError && <Row label="Last error" value={status.lastError} />}
          </dl>
          {live && (
            <p className="mb-2 text-muted-foreground">
              A native client is holding these tools, so the in-page agent panel is
              hidden: an agent on this page has no chat box to type into and must
              call the tools directly. Add <code>?agentpanel=1</code> to the URL to
              bring it back for a side-by-side comparison.
            </p>
          )}
          {!live && (
            <p className="mb-2 text-muted-foreground">
              No in-browser agent surface detected here — tools still work via the
              in-page agent panel. For the native path, either enable{" "}
              <code>chrome://flags/#enable-webmcp-testing</code> in Google Chrome and
              relaunch (then inspect the tools under{" "}
              <strong>DevTools → Application → WebMCP</strong>), or open this page in
              the ChatGPT desktop app's built-in browser using <strong>GPT-5.6 Sol</strong>{" "}
              or <strong>Terra</strong> (Luna has WebMCP disabled), with{" "}
              <strong>Settings → Browser → Permissions → Enable site tools</strong> on.
              This badge re-checks automatically once an agent attaches.
            </p>
          )}
          <p className="mb-1 font-medium">Exposed tools</p>
          <ul className="space-y-0.5 text-muted-foreground">
            {tools.map((t) => (
              <li key={t.name}>
                <code>{t.name}</code>
                {t.readOnly ? " · read" : " · write (needs approval)"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}
