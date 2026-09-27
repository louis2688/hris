"use client";

import * as React from "react";
import { CalendarPlus, Pencil } from "lucide-react";
import { TRAINING_STATUSES } from "@hris/shared";
import { saveEventAction, trainingFeedbackAction } from "@/server/actions/growth";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { RatingPills } from "../performance/peer-ui";

export type EventValues = {
  id: string;
  programId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  trainer: string | null;
  cost: string | null;
  capacity: number | null;
  status: string;
};

function EventForm({ event, programs, onDone }: { event?: EventValues; programs: { id: string; name: string }[]; onDone: () => void }) {
  return (
    <ActionForm action={saveEventAction.bind(null, event?.id)} onSuccess={onDone} successHref={event ? undefined : (id: string) => `/training/${id}`} submitLabel={event ? "Save event" : "Create event"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Title" name="title" required className="sm:col-span-2">
          <Input id="title" name="title" defaultValue={event?.title} />
        </FormField>
        <FormField label="Program" name="programId" required>
          <Select id="programId" name="programId" defaultValue={event?.programId ?? programs[0]?.id}>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status" name="status">
          <Select id="status" name="status" defaultValue={event?.status ?? "SCHEDULED"}>
            {TRAINING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0] + s.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Starts" name="startsAt" required>
          <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={event?.startsAt} />
        </FormField>
        <FormField label="Ends" name="endsAt" required>
          <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={event?.endsAt} />
        </FormField>
        <FormField label="Location" name="location">
          <Input id="location" name="location" defaultValue={event?.location ?? ""} placeholder="Room, venue or video link" />
        </FormField>
        <FormField label="Trainer" name="trainer">
          <Input id="trainer" name="trainer" defaultValue={event?.trainer ?? ""} />
        </FormField>
        <FormField label="Cost per participant (PHP)" name="cost">
          <Input id="cost" name="cost" type="number" min={0} step="0.01" defaultValue={event?.cost ?? ""} />
        </FormField>
        <FormField label="Capacity" name="capacity" hint="Leave blank for no limit">
          <Input id="capacity" name="capacity" type="number" min={1} defaultValue={event?.capacity ?? ""} />
        </FormField>
      </div>
      <p className="text-xs text-slate-500">Times are Asia/Manila.</p>
    </ActionForm>
  );
}

export function EventButton({ event, programs, variant = "brand" }: { event?: EventValues; programs: { id: string; name: string }[]; variant?: "brand" | "secondary" }) {
  const [open, setOpen] = React.useState(false);
  if (!programs.length && !event) return <p className="text-sm text-slate-500">Add a program first</p>;
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {event ? <Pencil /> : <CalendarPlus />} {event ? "Edit event" : "New event"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={event ? "Edit training event" : "New training event"}>
          {open ? <EventForm event={event} programs={programs} onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TrainingFeedbackButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Rate this training
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Training feedback" description={title}>
          {open ? (
            <ActionForm action={trainingFeedbackAction.bind(null, id)} onSuccess={() => setOpen(false)} submitLabel="Send feedback">
              <FormField label="How useful was it?" name="rating" required>
                <RatingPills name="rating" label="How useful was it?" />
              </FormField>
              <FormField label="Comment" name="comment">
                <Textarea id="comment" name="comment" rows={3} placeholder="What worked, what to change" />
              </FormField>
            </ActionForm>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
