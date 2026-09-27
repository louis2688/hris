"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { aiScoreTone, type ScreeningResult } from "@hris/shared";
import { screenCandidateAction } from "@/server/actions/ai";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn, fmtDateTime } from "@/lib/utils";

const TONE = { green: "bg-[#e5f2ea] text-[#1a6641]", amber: "bg-[#f8edd5] text-[#7a4f05]", red: "bg-[#f9e4df] text-[#a3261a]" };

export function AiScreeningCard({ candidateId, result, screenedAt, configured }: { candidateId: string; result: ScreeningResult | null; screenedAt: string | null; configured: boolean }) {
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const screen = () =>
    start(async () => {
      const r = await screenCandidateAction(candidateId);
      if (r.ok) toast.success(`AI score ${r.data.score}/100`);
      else toast.error(r.error);
      router.refresh();
    });

  return (
    <Card>
      <CardHeader
        title="AI screening"
        action={
          configured ? (
            <Button size="sm" variant="secondary" onClick={screen} loading={pending}>
              {pending ? null : <Sparkles />} {result ? "Re-screen" : "Screen with AI"}
            </Button>
          ) : null
        }
      />
      <CardBody className="space-y-4 text-sm">
        {!configured ? (
          <p className="text-ink-muted">AI is not configured - ask an admin to set ANTHROPIC_API_KEY.</p>
        ) : !result ? (
          <p className="text-ink-muted">Not screened yet. Reads the newest PDF resume and compares it with the vacancy description.</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span data-testid="ai-score" className={cn("rounded-2xl px-3 py-1.5 font-display text-2xl font-bold tabular-nums", TONE[aiScoreTone(result.score)])}>
                {result.score}
              </span>
              <div className="text-xs text-slate-500">
                <p className="font-medium text-ink">Match score out of 100</p>
                {screenedAt ? <p>Screened {fmtDateTime(screenedAt)}</p> : null}
              </div>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-slate-700">
              {result.summary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <Section title="Strengths" items={result.strengths} />
            <Section title="Gaps" items={result.gaps} />
            <p>
              <span className="font-semibold text-ink">Suggested next step: </span>
              <span className="text-slate-700">{result.nextStep}</span>
            </p>
          </>
        )}
        {configured ? <p className="rounded-xl bg-canvas px-3 py-2 text-xs text-ink-muted ring-1 ring-inset ring-hairline">AI suggestion - review before deciding. It never moves the candidate between stages.</p> : null}
      </CardBody>
    </Card>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="list-disc space-y-1 pl-5 text-slate-700">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}
