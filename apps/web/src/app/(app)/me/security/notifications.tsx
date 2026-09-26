"use client";

import { saveEmailPrefAction } from "@/server/actions/settings";
import { ActionForm } from "@/components/action-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/input";

export function NotificationPrefs({ emailOptIn }: { emailOptIn: boolean }) {
  return (
    <Card>
      <CardHeader title="Notifications" description="In-app notifications are always on. Choose whether we also email you." />
      <CardBody>
        <ActionForm action={saveEmailPrefAction} submitLabel="Save preferences" className="space-y-2">
          <Checkbox name="emailOptIn" defaultChecked={emailOptIn} label="Email me when something needs my attention" />
        </ActionForm>
      </CardBody>
    </Card>
  );
}
