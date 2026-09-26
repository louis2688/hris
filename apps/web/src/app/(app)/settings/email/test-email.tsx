"use client";

import { sendTestEmailAction } from "@/server/actions/settings";
import { ActionForm } from "@/components/action-form";

export function TestEmailButton() {
  return (
    <ActionForm action={sendTestEmailAction} submitLabel="Send test email" submitVariant="secondary" className="space-y-0">
      {null}
    </ActionForm>
  );
}
