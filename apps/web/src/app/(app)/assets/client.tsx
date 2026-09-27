"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { ASSET_CATEGORIES, ASSET_STATUS_LABELS } from "@hris/shared";
import { assignAssetAction, saveAssetAction } from "@/server/actions/people";
import { ActionForm, FormField, useFormCtx } from "@/components/action-form";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";

type Status = keyof typeof ASSET_STATUS_LABELS;
const TONE = { AVAILABLE: "green", ASSIGNED: "blue", REPAIR: "amber", RETIRED: "slate" } as const;
export const AssetStatusBadge = ({ status }: { status: Status }) => <Badge tone={TONE[status]}>{ASSET_STATUS_LABELS[status]}</Badge>;

type Initial = { id: string; tag: string; name: string; category: string; serialNumber: string | null; purchaseDate: string | null; cost: string | null; notes: string | null };

export function AssetDialog({ initial, categories }: { initial?: Initial; categories: string[] }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const cats = [...new Set([...ASSET_CATEGORIES, ...categories])];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {initial ? (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Pencil /> Edit
        </Button>
      ) : (
        <Button variant="brand" onClick={() => setOpen(true)}>
          <Plus /> Add asset
        </Button>
      )}
      <DialogContent title={initial ? "Edit asset" : "Add asset"}>
        <ActionForm
          action={saveAssetAction.bind(null, initial?.id)}
          onSuccess={(id: string) => {
            setOpen(false);
            if (!initial) router.push(`/assets/${id}`);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Asset tag" name="tag" required>
              <Input id="tag" name="tag" defaultValue={initial?.tag} placeholder="LPT-0012" className="font-mono uppercase" />
            </FormField>
            <FormField label="Category" name="category" required>
              <Select id="category" name="category" defaultValue={initial?.category ?? "Laptop"}>
                {cats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Name" name="name" required className="sm:col-span-2">
              <Input id="name" name="name" defaultValue={initial?.name} placeholder='MacBook Air 13" M3' />
            </FormField>
            <FormField label="Serial number" name="serialNumber">
              <Input id="serialNumber" name="serialNumber" defaultValue={initial?.serialNumber ?? ""} className="font-mono" />
            </FormField>
            <FormField label="Purchase date" name="purchaseDate">
              <Input id="purchaseDate" name="purchaseDate" type="date" defaultValue={initial?.purchaseDate ?? ""} />
            </FormField>
            <FormField label="Cost (PHP)" name="cost">
              <Input id="cost" name="cost" inputMode="decimal" defaultValue={initial?.cost ?? ""} placeholder="65,000.00" />
            </FormField>
            <FormField label="Notes" name="notes" className="sm:col-span-2">
              <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} rows={2} />
            </FormField>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function AssignForm({ id, employees, current }: { id: string; employees: { id: string; name: string }[]; current?: string | null }) {
  return (
    <ActionForm action={assignAssetAction.bind(null, id)} hideSubmit resetOnSuccess className="space-y-0">
      <AssignFields employees={employees} current={current} />
    </ActionForm>
  );
}

function AssignFields({ employees, current }: { employees: { id: string; name: string }[]; current?: string | null }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <FormField label={current ? "Reassign to" : "Assign to"} name="employeeId" className="flex-1">
        <Select id="employeeId" name="employeeId" defaultValue="">
          <option value="">Pick an employee</option>
          {employees
            .filter((e) => e.id !== current)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </Select>
      </FormField>
      <SubmitAssign />
    </div>
  );
}

function SubmitAssign() {
  const { pending } = useFormCtx();
  return (
    <Button type="submit" loading={pending} className="sm:mt-[26px]">
      Assign
    </Button>
  );
}
