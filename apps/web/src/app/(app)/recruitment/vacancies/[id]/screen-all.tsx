"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { screenCandidateAction } from "@/server/actions/ai";
import { Button } from "@/components/ui/button";

/** Screens candidates one at a time (sequential keeps AI rate limits and cost predictable). */
export function ScreenAll({ ids }: { ids: string[] }) {
  const [done, setDone] = React.useState<number | null>(null);
  const router = useRouter();
  async function go() {
    let failed = 0;
    let lastError = "";
    for (let i = 0; i < ids.length; i++) {
      setDone(i);
      const r = await screenCandidateAction(ids[i]!);
      if (!r.ok) (failed++, (lastError = r.error));
    }
    setDone(null);
    router.refresh();
    if (failed) toast.warning(`Screened ${ids.length - failed} of ${ids.length}. ${failed} skipped: ${lastError}`);
    else toast.success(`Screened ${ids.length} candidate${ids.length === 1 ? "" : "s"}`);
  }
  if (!ids.length) return null;
  return (
    <Button variant="secondary" onClick={go} loading={done !== null} aria-live="polite">
      {done === null ? (
        <>
          <Sparkles /> Screen {ids.length} unscreened
        </>
      ) : (
        `Screening ${done + 1} of ${ids.length}...`
      )}
    </Button>
  );
}
