"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { addLeaveCommentAction, cancelLeaveRequestAction, decideLeaveRequestAction } from "@/server/actions/leave";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import * as React from "react";

export function DecisionForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(decideLeaveRequestAction.bind(null, id), undefined);
  React.useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.message ?? "Done");
    else toast.error(state.error);
  }, [state]);
  return (
    <form action={action} className="space-y-3">
      <Textarea name="note" placeholder="Optional note for the employee" rows={3} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" name="decision" value="REJECTED" variant="destructive" loading={pending}>
          Reject
        </Button>
        <Button type="submit" name="decision" value="APPROVED" variant="success" loading={pending}>
          Approve
        </Button>
      </div>
    </form>
  );
}

export function CancelForm({ id }: { id: string }) {
  return (
    <ActionForm action={cancelLeaveRequestAction.bind(null, id)} submitLabel="Cancel request" submitVariant="secondary">
      <FormField label="Reason" name="note">
        <Textarea id="note" name="note" rows={2} placeholder="Optional" />
      </FormField>
    </ActionForm>
  );
}

export function CommentForm({ id }: { id: string }) {
  return (
    <ActionForm action={addLeaveCommentAction.bind(null, id)} submitLabel="Comment" submitVariant="secondary" resetOnSuccess className="space-y-2">
      <FormField label="Add a comment" name="note">
        <Textarea id="note" name="note" rows={2} placeholder="Visible to the employee and approvers" />
      </FormField>
    </ActionForm>
  );
}
