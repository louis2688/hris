"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { decideTimesheetAction } from "@/server/actions/attendance";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export function DecideTimesheet({ id }: { id: string }) {
  const [state, action, pending] = useActionState(decideTimesheetAction.bind(null, id), undefined);
  React.useEffect(() => {
    if (state) (state.ok ? toast.success : toast.error)(state.ok ? (state.message ?? "Done") : state.error);
  }, [state]);
  return (
    <form action={action} className="space-y-3">
      <Textarea name="note" rows={2} placeholder="Optional note" />
      <div className="grid grid-cols-2 gap-2 sm:w-80">
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
