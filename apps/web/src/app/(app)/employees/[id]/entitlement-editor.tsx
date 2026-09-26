"use client";

import * as React from "react";
import type { LeaveBalance } from "@hris/shared";
import { upsertEntitlementAction } from "@/server/actions/leave";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";

export function EntitlementEditor({ employeeId, year, balances, types }: { employeeId: string; year: number; balances: LeaveBalance[]; types: { id: string; name: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [typeId, setTypeId] = React.useState(types[0]?.id ?? "");
  const current = balances.find((b) => b.leaveTypeId === typeId);
  return (
    <Card>
      <CardHeader
        title="Entitlements"
        description="Days granted per leave type for the year"
        action={
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Adjust
          </Button>
        }
      />
      <ul className="divide-y divide-slate-100 text-sm">
        {balances.map((b) => (
          <li key={b.leaveTypeId} className="grid grid-cols-[1fr_auto] gap-2 px-5 py-2.5 sm:grid-cols-[1fr_repeat(4,80px)] sm:text-right">
            <span className="text-left">{b.leaveTypeName}</span>
            <span className="hidden text-slate-500 sm:block">{b.entitled} ent.</span>
            <span className="hidden text-slate-500 sm:block">{b.carriedOver} c/o</span>
            <span className="hidden text-slate-500 sm:block">{b.adjustment} adj.</span>
            <span className="font-medium">{b.entitled + b.carriedOver + b.adjustment} total</span>
          </li>
        ))}
      </ul>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Adjust entitlement ${year}`}>
          <ActionForm key={typeId} action={upsertEntitlementAction} onSuccess={() => setOpen(false)} submitLabel="Save">
            <input type="hidden" name="employeeId" value={employeeId} />
            <input type="hidden" name="year" value={year} />
            <FormField label="Leave type" name="leaveTypeId" required>
              <Select id="leaveTypeId" name="leaveTypeId" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Entitled" name="entitledDays" required>
                <Input id="entitledDays" name="entitledDays" type="number" step="0.5" min={0} defaultValue={current?.entitled ?? 0} />
              </FormField>
              <FormField label="Carried over" name="carriedOver">
                <Input id="carriedOver" name="carriedOver" type="number" step="0.5" min={0} defaultValue={current?.carriedOver ?? 0} />
              </FormField>
              <FormField label="Adjustment" name="adjustment" hint="Can be negative">
                <Input id="adjustment" name="adjustment" type="number" step="0.5" defaultValue={current?.adjustment ?? 0} />
              </FormField>
            </div>
            <FormField label="Note" name="note">
              <Input id="note" name="note" placeholder="Reason for the change" />
            </FormField>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
