"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { CHECKLIST_KIND_LABELS, TASK_OWNERS, TASK_OWNER_LABELS } from "@hris/shared";
import { deleteTemplateItemAction, moveTemplateItemAction, saveTemplateAction, saveTemplateItemAction } from "@/server/actions/people";
import { ActionForm, ConfirmButton, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { ActionButton } from "../../announcements/client";

type Tpl = { id: string; name: string; kind: "ONBOARDING" | "OFFBOARDING"; isDefault: boolean };
type Item = { id: string; title: string; owner: (typeof TASK_OWNERS)[number]; dueOffsetDays: number };

export function TemplateDialog({ initial }: { initial?: Tpl }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {initial ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Pencil /> Edit
        </Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus /> New template
        </Button>
      )}
      <DialogContent title={initial ? "Edit template" : "New checklist template"} description={initial ? undefined : "Offboarding templates start with a \"Return company assets\" item."}>
        <ActionForm action={saveTemplateAction.bind(null, initial?.id)} onSuccess={() => setOpen(false)}>
          <FormField label="Name" name="name" required>
            <Input id="name" name="name" defaultValue={initial?.name} placeholder="Standard onboarding" />
          </FormField>
          <FormField label="Kind" name="kind" required>
            <Select id="kind" name="kind" defaultValue={initial?.kind ?? "ONBOARDING"}>
              {Object.entries(CHECKLIST_KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </FormField>
          <Checkbox name="isDefault" defaultChecked={initial?.isDefault ?? false} label="Default - start automatically for new hires / leavers" />
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

function ItemFields({ item, uid }: { item?: Item; uid: string }) {
  return (
    <>
      <FormField label="Task" name="title" required className="sm:col-span-2">
        <Input id={`title-${uid}`} name="title" defaultValue={item?.title} placeholder="e.g. Issue laptop" aria-label="Task" />
      </FormField>
      <FormField label="Owner" name="owner">
        <Select name="owner" defaultValue={item?.owner ?? "HR"} aria-label="Owner">
          {TASK_OWNERS.map((o) => (
            <option key={o} value={o}>
              {TASK_OWNER_LABELS[o]}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Due (days)" name="dueOffsetDays">
        <Input name="dueOffsetDays" type="number" min={0} max={365} defaultValue={item?.dueOffsetDays ?? 0} aria-label="Due offset in days" />
      </FormField>
    </>
  );
}

export function AddItemForm({ templateId }: { templateId: string }) {
  return (
    <ActionForm action={saveTemplateItemAction.bind(null, templateId, undefined)} resetOnSuccess submitLabel="Add item" submitVariant="secondary" className="space-y-0">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_120px]">
        <ItemFields uid={templateId} />
      </div>
    </ActionForm>
  );
}

export function ItemRow({ item, first, last, kind }: { item: Item; first: boolean; last: boolean; kind: Tpl["kind"] }) {
  const [edit, setEdit] = React.useState(false);
  const due = item.dueOffsetDays === 0 ? (kind === "ONBOARDING" ? "Day 1" : "Last day") : kind === "ONBOARDING" ? `Day ${item.dueOffsetDays + 1}` : `${item.dueOffsetDays}d before`;
  return (
    <li className="flex items-center gap-2 px-5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{item.title}</p>
        <p className="text-xs text-slate-500">
          {TASK_OWNER_LABELS[item.owner]} · {due}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        <ActionButton action={() => moveTemplateItemAction(item.id, -1)} size="icon-sm" disabled={first} aria-label={`Move ${item.title} up`}>
          <ArrowUp />
        </ActionButton>
        <ActionButton action={() => moveTemplateItemAction(item.id, 1)} size="icon-sm" disabled={last} aria-label={`Move ${item.title} down`}>
          <ArrowDown />
        </ActionButton>
        <Button variant="ghost" size="icon-sm" onClick={() => setEdit(true)} aria-label={`Edit ${item.title}`}>
          <Pencil />
        </Button>
        <ConfirmButton action={deleteTemplateItemAction.bind(null, item.id)} confirm={`Remove "${item.title}"?`} variant="ghost" size="icon-sm" className="text-red-700">
          <Trash2 />
        </ConfirmButton>
      </div>
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent title="Edit item">
          <ActionForm action={saveTemplateItemAction.bind(null, "", item.id)} onSuccess={() => setEdit(false)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <ItemFields item={item} uid={item.id} />
            </div>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </li>
  );
}
