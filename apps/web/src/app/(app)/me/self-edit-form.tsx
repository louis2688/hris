"use client";

import { MARITAL_STATUSES } from "@hris/shared";
import { updateSelfAction } from "@/server/actions/employees";
import { ActionForm, FormField } from "@/components/action-form";
import { Input, Select } from "@/components/ui/input";

type E = {
  preferredName: string | null;
  maritalStatus: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  phone: string | null;
  mobile: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

export function SelfEditForm({ e }: { e: E }) {
  const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
  return (
    <ActionForm action={updateSelfAction} submitLabel="Save changes">
      <p className="text-sm text-slate-500">You can update your contact details here. Job and personal records are maintained by HR.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Preferred name" name="preferredName">
          <Input id="preferredName" name="preferredName" defaultValue={e.preferredName ?? ""} />
        </FormField>
        <FormField label="Marital status" name="maritalStatus">
          <Select id="maritalStatus" name="maritalStatus" defaultValue={e.maritalStatus ?? ""}>
            <option value="">Not specified</option>
            {MARITAL_STATUSES.map((m) => (
              <option key={m} value={m}>
                {cap(m)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Work email" name="workEmail">
          <Input id="workEmail" name="workEmail" type="email" defaultValue={e.workEmail ?? ""} />
        </FormField>
        <FormField label="Personal email" name="personalEmail">
          <Input id="personalEmail" name="personalEmail" type="email" defaultValue={e.personalEmail ?? ""} />
        </FormField>
        <FormField label="Phone" name="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={e.phone ?? ""} />
        </FormField>
        <FormField label="Mobile" name="mobile">
          <Input id="mobile" name="mobile" type="tel" defaultValue={e.mobile ?? ""} />
        </FormField>
        <FormField label="Address line 1" name="addressLine1" className="sm:col-span-2">
          <Input id="addressLine1" name="addressLine1" defaultValue={e.addressLine1 ?? ""} />
        </FormField>
        <FormField label="Address line 2" name="addressLine2" className="sm:col-span-2">
          <Input id="addressLine2" name="addressLine2" defaultValue={e.addressLine2 ?? ""} />
        </FormField>
        <FormField label="City" name="city">
          <Input id="city" name="city" defaultValue={e.city ?? ""} />
        </FormField>
        <FormField label="State / Province" name="state">
          <Input id="state" name="state" defaultValue={e.state ?? ""} />
        </FormField>
        <FormField label="Postal code" name="postalCode">
          <Input id="postalCode" name="postalCode" defaultValue={e.postalCode ?? ""} />
        </FormField>
        <FormField label="Country" name="country">
          <Input id="country" name="country" defaultValue={e.country ?? ""} />
        </FormField>
      </div>
    </ActionForm>
  );
}
