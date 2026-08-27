import { useState, useRef, useEffect } from "react";
import { Bot, Send, Settings2, Loader2 } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import {
  runAgentTurn, loadKey, saveKey, loadModel, saveModel, type ChatMsg,
} from "@/lib/webmcp/agentClient";

/**
 * In-page WebMCP agent panel (admin-only, bring-your-own-key). Lists the same
 * tools registered with the browser's native WebMCP surface and drives them via
 * an OpenAI tool-calling loop the admin powers with their own key — so the
 * cooperative demo is reproducible in ANY browser, and no secret ships in the
 * frontend. Writes still pause on the shared approval dialog.
 */
export function AgentPanel() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [key, setKey] = useState(loadKey);
  const [model, setModel] = useState(loadModel);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!key) setShowSettings(true);
  }, [key]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  if (!isAdmin) return null;

  const persistKey = (v: string) => { setKey(v); saveKey(v); };
  const persistModel = (v: string) => { setModel(v); saveModel(v); };

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!key) { setShowSettings(true); setError("Add your OpenAI API key first."); return; }
    setError("");
    setInput("");
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const { messages: updated } = await runAgentTurn(key, model, next);
      setMessages(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
          aria-label="Open HR agent"
        >
          <Bot className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" /> HR Agent
            </SheetTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowSettings((s) => !s)} aria-label="Settings">
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
          <SheetDescription>
            Ask in plain language. Changes pause for your confirmation before saving.
          </SheetDescription>
        </SheetHeader>

        {showSettings && (
          <div className="space-y-3 border-b bg-muted/30 p-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">OpenAI API key (stays in your browser)</label>
              <Input type="password" placeholder="sk-..." value={key} onChange={(e) => persistKey(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Model</label>
              <Input value={model} onChange={(e) => persistModel(e.target.value)} placeholder="gpt-4o-mini" />
            </div>
            <p className="text-xs text-muted-foreground">
              Your key is sent directly to OpenAI from this browser and never leaves your device otherwise.
            </p>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-3 p-4">
            {messages.length === 0 && (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                Try: "Add Priya Sharma (EMP007) to Engineering as a Backend Developer",
                or "Approve the pending leave for EMP002".
              </div>
            )}
            {messages.filter((m) => m.role === "user" || (m.role === "assistant" && m.content)).map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "self-end bg-primary text-primary-foreground"
                    : "self-start border bg-card"
                }`}
              >
                {m.content}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 self-start text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </div>
            )}
            {error && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
          </div>
        </div>

        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Message the HR agent…"
              rows={1}
              className="max-h-32 min-h-[40px] resize-none"
            />
            <Button size="icon" onClick={send} disabled={busy} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
