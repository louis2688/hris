"use client";

import * as React from "react";
import { ArrowUp, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { AI_MAX_INPUT } from "@hris/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; error?: boolean };

const SUGGESTIONS = ["How many vacation leave days do I have?", "When is the next holiday?", "What is our policy on ", "Summarize my attendance this month", "Show my latest payslip"];
const TOOL_LABELS: Record<string, string> = {
  get_leave_balances: "Checking your leave balances",
  list_my_leave_requests: "Looking up your leave requests",
  list_holidays: "Checking the holiday calendar",
  get_my_attendance_summary: "Reading your attendance",
  get_latest_payslip: "Opening your latest payslip",
  search_policies: "Searching company policies",
  get_my_profile: "Reading your profile",
};

export function Chat({ firstName, mock }: { firstName: string; mock: boolean }) {
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [msgs, status]);

  const patchLast = (f: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), f(all.at(-1)!)]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy || q.length > AI_MAX_INPUT) return;
    const history = [...msgs.filter((m) => !m.error && m.content), { role: "user" as const, content: q }];
    setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setStatus("Thinking");
    try {
      const res = await fetch("/api/v1/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }) });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? "The assistant is unavailable right now.");
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const ev = JSON.parse(line) as { type: string; text?: string; name?: string; message?: string };
          if (ev.type === "text") {
            setStatus(null);
            patchLast((m) => ({ ...m, content: m.content + ev.text }));
          } else if (ev.type === "tool") setStatus(TOOL_LABELS[ev.name!] ?? "Looking that up");
          else if (ev.type === "error") throw new Error(ev.message);
        }
      }
    } catch (e) {
      patchLast((m) => ({ ...m, content: (e as Error).message || "Something went wrong.", error: true }));
    } finally {
      setBusy(false);
      setStatus(null);
      inputRef.current?.focus();
    }
  }

  const pick = (s: string) => (s.endsWith(" ") ? (setInput(s), inputRef.current?.focus()) : send(s));

  return (
    <Card className="flex min-h-[60vh] flex-col overflow-hidden">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
        {msgs.length === 0 ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-bone text-ink">
              <Sparkles className="size-5" aria-hidden />
            </div>
            <p className="font-semibold text-ink">Hi {firstName}, what do you need?</p>
            <p className="mt-1 text-sm text-ink-muted">I only see your own records. Try one of these:</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => pick(s)} className="rounded-full bg-canvas px-3.5 py-2 text-left text-sm text-ink ring-1 ring-inset ring-hairline transition-colors hover:bg-bone focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus">
                  {s.endsWith(" ") ? `${s.trim()} ...` : s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-on-dark">{m.content}</p>
              </div>
            ) : (
              <div key={i} data-testid="assistant-message" className={cn("max-w-[92%] text-sm leading-relaxed text-ink", m.error && "rounded-xl bg-red-50 px-3.5 py-2.5 text-red-700 ring-1 ring-inset ring-red-100")} role={m.error ? "alert" : undefined}>
                {m.content ? <Markdown text={m.content} /> : null}
                {i === msgs.length - 1 && status ? (
                  <p className="flex items-center gap-2 text-ink-muted">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> {status}...
                  </p>
                ) : null}
              </div>
            ),
          )
        )}
        <div ref={endRef} />
      </div>
      <form
        className="border-t border-slate-100 p-3 sm:p-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="flex items-end gap-2">
          <label htmlFor="assistant-input" className="sr-only">
            Message
          </label>
          <textarea
            id="assistant-input"
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={AI_MAX_INPUT}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask a question"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-3xl border border-hairline bg-white px-5 py-2.5 text-[15px] text-ink placeholder:text-slate-400 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus sm:text-sm"
          />
          <Button type="submit" variant="brand" size="icon" loading={busy} disabled={!input.trim()} aria-label="Send">
            {busy ? null : <ArrowUp />}
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 px-2 text-xs text-slate-500">
          <span>AI can make mistakes. Check important details with HR.{mock ? " (mock AI)" : ""}</span>
          {msgs.length ? (
            <button type="button" onClick={() => setMsgs([])} disabled={busy} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 hover:bg-ink/5 hover:text-ink disabled:opacity-50">
              <RotateCcw className="size-3" aria-hidden /> New chat
            </button>
          ) : input.length > AI_MAX_INPUT - 200 ? (
            <span>
              {input.length}/{AI_MAX_INPUT}
            </span>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

const LIST_RE = /^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/;
const HEADING_RE = /^#{1,6}\s+(.*)$/;

/** Tiny markdown subset rendered as React elements (never raw HTML): paragraphs, lists, headings, bold, italic, code. */
function Markdown({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(<p key={out.length}>{para.map((l, i) => [i ? <br key={i} /> : null, <Inline key={`l${i}`} text={l} />])}</p>);
    para = [];
  };
  const flushList = () => {
    const l = list as { ordered: boolean; items: string[] } | null;
    if (l) {
      const Tag = l.ordered ? "ol" : "ul";
      out.push(
        <Tag key={out.length} className={cn("space-y-1 pl-5", l.ordered ? "list-decimal" : "list-disc")}>
          {l.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} />
            </li>
          ))}
        </Tag>,
      );
    }
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const li = line.match(LIST_RE);
    const h = line.match(HEADING_RE);
    if (li) {
      flushPara();
      const ordered = !!li[1];
      if (list && (list as { ordered: boolean }).ordered !== ordered) flushList();
      (list ??= { ordered, items: [] }).items.push(li[2]!);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      out.push(
        <p key={out.length} className="font-semibold">
          <Inline text={h[1]!} />
        </p>,
      );
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div className="space-y-2.5">{out}</div>;
}

function Inline({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|(?<![\w*])[_*][^_*\n]+[_*](?![\w*]))/g).map((part, i) => {
    if (/^\*\*.+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`.+`$/.test(part)) return <code key={i} className="rounded bg-bone px-1 py-0.5 font-mono text-[0.85em]">{part.slice(1, -1)}</code>;
    if (/^[_*].+[_*]$/.test(part) && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}
