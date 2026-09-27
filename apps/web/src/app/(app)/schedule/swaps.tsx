"use client";

import * as React from "react";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { cancelSwapAction, decideSwapAction, requestSwapAction, respondSwapAction } from "@/server/actions/scheduling";
import type { ActionResult } from "@/server/actions/_helpers";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fmtDate } from "@/lib/utils";

type Swap = {
  id: string;
  date: string;
  reason: string | null;
  status: string;
  accepted: boolean;
  requesterId: string;
  targetId: string;
  requester: string;
  target: string;
  requesterShift: string;
  targetShift: string;
};

function statusBadge(s: Swap) {
  if (s.status === "PENDING") return s.accepted ? <Badge tone="blue">Awaiting approval</Badge> : <Badge tone="amber">Awaiting teammate</Badge>;
  if (s.status === "APPROVED") return <Badge tone="green">Approved</Badge>;
  if (s.status === "REJECTED") return <Badge tone="red">Declined</Badge>;
  return <Badge>Cancelled</Badge>;
}

function Act({ label, action, variant = "secondary" }: { label: string; action: () => Promise<ActionResult<unknown>>; variant?: "secondary" | "ghost" | "default" }) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      variant={variant}
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await action();
          if (r.ok) toast.success(r.message ?? "Done");
          else toast.error(r.error);
        })
      }
    >
      {label}
    </Button>
  );
}

export function Swaps({ meId, today, teammates, mine, toApprove }: { meId: string | null; today: string; teammates: { id: string; name: string }[]; mine: Swap[]; toApprove: Swap[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Card>
      <CardHeader
        title="Shift swaps"
        description="Trade a day with a teammate. They accept, then your manager approves."
        action={
          meId ? (
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={!teammates.length} title={teammates.length ? undefined : "No teammates with the same manager"}>
              <ArrowLeftRight /> Request swap
            </Button>
          ) : null
        }
      />

      {toApprove.length ? (
        <section aria-label="Swaps to approve" className="border-b border-slate-100">
          <p className="bg-canvas px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Needs your approval</p>
          <ul className="divide-y divide-slate-100">
            {toApprove.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-ink">
                    {s.requester} <span className="text-slate-400">and</span> {s.target} · {fmtDate(s.date, "EEE d MMM")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.requester}: {s.requesterShift} → {s.targetShift}
                    {s.reason ? ` · "${s.reason}"` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Act label="Reject" variant="ghost" action={() => decideSwapAction(s.id, false)} />
                  <Act label="Approve" variant="default" action={() => decideSwapAction(s.id, true)} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mine.length === 0 ? (
        toApprove.length ? null : <EmptyState title="No swap requests" description="Requests you send or receive show up here." />
      ) : (
        <ul className="divide-y divide-slate-100" aria-label="My swap requests">
          {mine.map((s) => {
            const incoming = s.targetId === meId;
            const pending = s.status === "PENDING";
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-ink">
                    {incoming ? `${s.requester} asks to swap` : `Swap with ${s.target}`} · {fmtDate(s.date, "EEE d MMM")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {pending ? (incoming ? `You would work ${s.requesterShift}; they take your ${s.targetShift}` : `You would work ${s.targetShift} instead of ${s.requesterShift}`) : null}
                    {s.reason ? `${pending ? " · " : ""}"${s.reason}"` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(s)}
                  {pending && incoming && !s.accepted ? (
                    <>
                      <Act label="Decline" variant="ghost" action={() => respondSwapAction(s.id, false)} />
                      <Act label="Accept" variant="default" action={() => respondSwapAction(s.id, true)} />
                    </>
                  ) : null}
                  {pending && !incoming ? <Act label="Cancel" variant="ghost" action={() => cancelSwapAction(s.id)} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Request a shift swap" description="You take their shift that day and they take yours.">
          <ActionForm action={requestSwapAction} onSuccess={() => setOpen(false)} submitLabel="Send request">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Date" name="date" required>
                <Input id="date" name="date" type="date" min={today} defaultValue={today} />
              </FormField>
              <FormField label="Swap with" name="targetId" required>
                <Select id="targetId" name="targetId" defaultValue="">
                  <option value="">Select teammate</option>
                  {teammates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <FormField label="Reason" name="reason">
              <Textarea id="reason" name="reason" rows={2} placeholder="Optional" />
            </FormField>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
