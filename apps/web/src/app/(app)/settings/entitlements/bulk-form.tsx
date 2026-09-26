"use client";

import * as React from "react";
import { bulkEntitlementAction } from "@/server/actions/leave";
import { ActionForm, FormField } from "@/components/action-form";
import { Checkbox, Input, Select } from "@/components/ui/input";

export function BulkEntitlementForm({ year, types }: { year: number; types: { id: string; name: string; defaultDays: number }[] }) {
  const [typeId, setTypeId] = React.useState(types[0]?.id ?? "");
  const t = types.find((x) => x.id === typeId);
  return (
    <ActionForm action={bulkEntitlementAction} submitLabel="Apply to all active employees" className="space-y-3">
      <input type="hidden" name="year" value={year} />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Leave type" name="leaveTypeId" required>
          <Select id="leaveTypeId" name="leaveTypeId" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Entitled days" name="entitledDays" required>
          <Input key={typeId} id="entitledDays" name="entitledDays" type="number" step="0.5" min={0} defaultValue={t?.defaultDays ?? 0} />
        </FormField>
        <div className="flex items-end pb-2">
          <Checkbox name="onlyMissing" defaultChecked label="Only employees without one" />
        </div>
      </div>
    </ActionForm>
  );
}
