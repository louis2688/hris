"use client";

import { saveNotificationPrefsAction } from "@/server/actions/settings";
import { ActionForm } from "@/components/action-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/input";

export function NotificationPrefs({ emailOptIn, pushOptIn }: { emailOptIn: boolean; pushOptIn: boolean }) {
  return (
    <Card>
      <CardHeader title="Notifications" description="In-app notifications are always on. Choose where else we reach you." />
      <CardBody>
        <ActionForm action={saveNotificationPrefsAction} submitLabel="Save preferences" className="space-y-2">
          <div className="flex flex-col gap-1">
            <Checkbox name="emailOptIn" defaultChecked={emailOptIn} label="Email me when something needs my attention" />
            <Checkbox name="pushOptIn" defaultChecked={pushOptIn} label="Send push notifications to my phone (Ugnayo mobile app)" />
          </div>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
