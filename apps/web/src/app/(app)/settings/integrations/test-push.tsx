"use client";

import { sendTestPushAction } from "@/server/actions/settings";
import { ActionForm } from "@/components/action-form";

export function TestPushButton() {
  return (
    <ActionForm action={sendTestPushAction} submitLabel="Send test push to me" submitVariant="secondary" className="space-y-0 [&>div]:justify-start">
      {null}
    </ActionForm>
  );
}
