"use client";

import * as React from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import type { ActionResult } from "@/server/actions/_helpers";
import { ackAnnouncementAction, saveAnnouncementAction } from "@/server/actions/people";
import { ActionForm, FormField, useFormCtx } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Input, Textarea } from "@/components/ui/input";

/** Button that runs a server action without a confirm prompt and toasts the result. Shared by the people-ops pages. */
export function ActionButton({
  action,
  children,
  variant = "ghost",
  size = "sm",
  className,
  ...rest
}: { action: () => Promise<ActionResult<unknown>> } & Omit<React.ComponentProps<typeof Button>, "onClick" | "action">) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await action();
          if (!r.ok) toast.error(r.error);
          else if (r.message) toast.success(r.message);
        })
      }
      {...rest}
    >
      {children}
    </Button>
  );
}

export function AckButton({ id }: { id: string }) {
  return (
    <ActionButton action={() => ackAnnouncementAction(id)} variant="default" size="default">
      Acknowledge
    </ActionButton>
  );
}

type Initial = { id: string; title: string; body: string; pinned: boolean; requiresAck: boolean; published: boolean };

export function AnnouncementEditor({ initial }: { initial?: Initial }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {initial ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Edit ${initial.title}`}>
          <Pencil /> Edit
        </Button>
      ) : (
        <Button variant="brand" onClick={() => setOpen(true)}>
          <Plus /> New announcement
        </Button>
      )}
      <DialogContent title={initial ? "Edit announcement" : "New announcement"} description="Plain text. Supports **bold**, - lists, 1. lists and [links](https://...)." className="sm:max-w-2xl">
        <ActionForm action={saveAnnouncementAction.bind(null, initial?.id)} onSuccess={() => setOpen(false)} hideSubmit>
          <FormField label="Title" name="title" required>
            <Input id="title" name="title" defaultValue={initial?.title} maxLength={160} />
          </FormField>
          <FormField label="Message" name="body" required>
            <Textarea id="body" name="body" defaultValue={initial?.body} rows={10} className="min-h-[200px]" />
          </FormField>
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-6">
            <Checkbox name="pinned" defaultChecked={initial?.pinned ?? false} label="Pin to the top" />
            <Checkbox name="requiresAck" defaultChecked={initial?.requiresAck ?? false} label="Policy - employees must acknowledge" />
          </div>
          <EditorButtons published={initial?.published ?? false} />
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

function EditorButtons({ published }: { published: boolean }) {
  const { pending } = useFormCtx();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
      {published ? (
        <Button type="submit" loading={pending}>
          Save changes
        </Button>
      ) : (
        <>
          <Button type="submit" variant="secondary" disabled={pending}>
            Save draft
          </Button>
          <Button type="submit" name="intent" value="publish" variant="brand" loading={pending}>
            Publish now
          </Button>
        </>
      )}
    </div>
  );
}
