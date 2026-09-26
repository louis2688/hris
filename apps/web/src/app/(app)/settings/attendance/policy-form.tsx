"use client";

import type { AttendancePolicy } from "@hris/shared";
import { savePolicyAction } from "@/server/actions/attendance";
import { ActionForm } from "@/components/action-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/input";

export function PolicyForm({ policy }: { policy: AttendancePolicy }) {
  return (
    <Card>
      <CardHeader title="Punch policy" description="What employees must do when clocking in from the web or phone." />
      <CardBody>
        <ActionForm action={savePolicyAction} submitLabel="Save policy" className="space-y-2">
          <Checkbox name="requirePasskey" defaultChecked={policy.requirePasskey} label="Require fingerprint / Face ID (device biometric via passkey)" />
          <Checkbox name="requirePhoto" defaultChecked={policy.requirePhoto} label="Require a selfie on every punch" />
          <Checkbox name="requireLocation" defaultChecked={policy.requireLocation} label="Record GPS location on every punch" />
          <p className="pt-1 text-xs text-slate-500">Terminal punches (fingerprint / face scanners) are always accepted and marked with the scan type.</p>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
