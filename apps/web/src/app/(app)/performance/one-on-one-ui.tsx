"use client";

import * as React from "react";
import { toast } from "sonner";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import type { ActionItem } from "@hris/shared";
import { addAgendaAction, deleteOneOnOneAction, saveOneOnOneAction, toggleActionItemAction } from "@/server/actions/growth";
import { ActionForm, ConfirmButton, FormField, useFormCtx } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { cn, fmtDate } from "@/lib/utils";

export type MeetingView = {
  id: string;
  employeeId: string;
  date: string;
  withName: string;
  agenda: string | null;
  notes: string | null;
  actionItems: ActionItem[];
  isManager: boolean;
  when: "past" | "today" | "upcoming";
};

function MeetingForm({ m, reports, employeeId, onDone }: { m?: MeetingView; reports: { id: string; name: string }[]; employeeId?: string; onDone: () => void }) {
  return (
    <ActionForm action={saveOneOnOneAction.bind(null, m?.id)} onSuccess={onDone} submitLabel={m ? "Save 1:1" : "Schedule"}>
      <div className="grid gap-4 sm:grid-cols-2">
        {m ? (
          <input type="hidden" name="employeeId" value={m.employeeId} />
        ) : (
          <FormField label="With" name="employeeId" required>
            <Select id="employeeId" name="employeeId" defaultValue={employeeId ?? reports[0]?.id}>
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField label="Date" name="date" required className={m ? "sm:col-span-2" : undefined}>
          <Input id="date" name="date" type="date" defaultValue={m?.date} />
        </FormField>
        <FormField label="Agenda" name="agenda" hint="One topic per line" className="sm:col-span-2">
          <Textarea id="agenda" name="agenda" defaultValue={m?.agenda ?? ""} rows={3} />
        </FormField>
        <FormField label="Notes" name="notes" hint="Shared: your report sees these notes too" className="sm:col-span-2">
          <Textarea id="notes" name="notes" defaultValue={m?.notes ?? ""} rows={4} />
        </FormField>
        <FormField label="Action items" name="actionItems" hint="One per line. Ticks are kept for lines you don't change." className="sm:col-span-2">
          <Textarea id="actionItems" name="actionItems" defaultValue={m?.actionItems.map((a) => a.text).join("\n") ?? ""} rows={3} />
        </FormField>
      </div>
    </ActionForm>
  );
}

export function ScheduleButton({ reports, employeeId, label = "Schedule 1:1", variant = "default", size }: { reports: { id: string; name: string }[]; employeeId?: string; label?: string; variant?: "default" | "secondary"; size?: "sm" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <CalendarPlus /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Schedule a 1:1">{open ? <MeetingForm reports={reports} employeeId={employeeId} onDone={() => setOpen(false)} /> : null}</DialogContent>
      </Dialog>
    </>
  );
}

function AddAgenda({ id }: { id: string }) {
  return (
    <ActionForm action={addAgendaAction.bind(null, id)} hideSubmit resetOnSuccess className="flex items-center gap-2 space-y-0">
      <label htmlFor={`ag-${id}`} className="sr-only">
        Add an agenda item
      </label>
      <Input id={`ag-${id}`} name="text" placeholder="Add an agenda item" className="h-9" />
      <AddBtn />
    </ActionForm>
  );
}
function AddBtn() {
  const { pending } = useFormCtx();
  return (
    <Button type="submit" size="sm" variant="secondary" loading={pending}>
      Add
    </Button>
  );
}

function Checklist({ id, items }: { id: string; items: ActionItem[] }) {
  const [state, setState] = React.useState(items);
  React.useEffect(() => setState(items), [items]);
  const [, start] = React.useTransition();
  return (
    <ul className="space-y-1">
      {state.map((a, i) => (
        <li key={i}>
          <label className="flex min-h-9 cursor-pointer items-start gap-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={a.done}
              className="mt-0.5 size-[18px] shrink-0 accent-ink"
              onChange={(e) => {
                const done = e.target.checked;
                setState((s) => s.map((x, j) => (j === i ? { ...x, done } : x)));
                start(async () => {
                  const r = await toggleActionItemAction(id, i, done);
                  if (!r.ok) {
                    toast.error(r.error);
                    setState(items);
                  }
                });
              }}
            />
            <span className={cn(a.done && "text-slate-400 line-through")}>{a.text}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

const WHEN = { past: null, today: <Badge tone="violet">Today</Badge>, upcoming: <Badge tone="blue">Upcoming</Badge> } as const;

export function MeetingCard({ m, reports }: { m: MeetingView; reports: { id: string; name: string }[] }) {
  const [editing, setEditing] = React.useState(false);
  const open = m.actionItems.filter((a) => !a.done).length;
  return (
    <Card className="p-4 sm:p-5" data-meeting={m.withName}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">1:1 with {m.withName}</p>
          <p className="text-xs text-slate-500">
            {fmtDate(m.date, "EEE, d MMM yyyy")}
            {m.actionItems.length ? ` · ${open} open action item${open === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        {WHEN[m.when]}
        {m.isManager ? (
          <div className="-my-1 flex gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label={`Edit 1:1 with ${m.withName}`}>
              <Pencil />
            </Button>
            <ConfirmButton action={() => deleteOneOnOneAction(m.id)} confirm="Delete this 1:1?" variant="ghost" size="icon-sm" className="text-tone-red-fg">
              <Trash2 />
              <span className="sr-only">Delete 1:1 with {m.withName}</span>
            </ConfirmButton>
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <section>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Agenda</h4>
          {m.agenda ? <p className="whitespace-pre-line text-sm text-slate-700">{m.agenda}</p> : <p className="text-sm text-slate-400">Nothing yet</p>}
          {m.when !== "past" ? (
            <div className="mt-2">
              <AddAgenda id={m.id} />
            </div>
          ) : null}
        </section>
        <section>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Notes</h4>
          {m.notes ? <p className="whitespace-pre-line text-sm text-slate-700">{m.notes}</p> : <p className="text-sm text-slate-400">No notes</p>}
        </section>
        <section>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Action items</h4>
          {m.actionItems.length ? <Checklist id={m.id} items={m.actionItems} /> : <p className="text-sm text-slate-400">None</p>}
        </section>
      </div>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={`1:1 with ${m.withName}`}>{editing ? <MeetingForm m={m} reports={reports} onDone={() => setEditing(false)} /> : null}</DialogContent>
      </Dialog>
    </Card>
  );
}
