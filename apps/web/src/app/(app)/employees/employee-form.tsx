"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  GENDERS,
  MARITAL_STATUSES,
  ROLES,
  ROLE_LABELS,
} from "@hris/shared";
import { createEmployeeAction, updateEmployeeAction } from "@/server/actions/employees";
import { ActionForm, FormField } from "@/components/action-form";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { isoDate } from "@/lib/utils";

export type Option = { id: string; name: string };
export type EmployeeFormOptions = { departments: Option[]; jobTitles: Option[]; locations: Option[]; managers: Option[] };

type Initial = Partial<{
  employeeCode: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  gender: string;
  dateOfBirth: Date | null;
  maritalStatus: string | null;
  nationality: string | null;
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
  departmentId: string | null;
  jobTitleId: string | null;
  locationId: string | null;
  managerId: string | null;
  employmentType: string;
  employmentStatus: string;
  hireDate: Date;
  terminationDate: Date | null;
  notes: string | null;
}>;

const d = (v: Date | null | undefined) => (v ? isoDate(v) : "");
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

export function EmployeeForm({ mode, id, initial = {}, options, section }: { mode: "create" | "edit"; id?: string; initial?: Initial; options: EmployeeFormOptions; section?: "personal" | "job" | "contact" }) {
  const router = useRouter();
  const [created, setCreated] = React.useState<{ id: string; initialPassword: string | null } | null>(null);
  const showAll = mode === "create";
  const show = (s: "personal" | "job" | "contact") => showAll || section === s;

  const action = mode === "create" ? createEmployeeAction : updateEmployeeAction.bind(null, id!);

  return (
    <>
      <ActionForm
        action={action as never}
        submitLabel={mode === "create" ? "Create employee" : "Save changes"}
        onSuccess={(data: unknown) => {
          if (mode === "create") setCreated(data as { id: string; initialPassword: string | null });
        }}
        className="space-y-6"
        footer={
          mode === "create" ? (
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
          ) : undefined
        }
      >
        {/* In edit mode only one section is visible, so keep the others as hidden inputs to satisfy the full schema. */}
        {!show("personal") ? <HiddenPersonal initial={initial} /> : null}
        {!show("job") ? <HiddenJob initial={initial} /> : null}
        {!show("contact") ? <HiddenContact initial={initial} /> : null}

        {show("personal") ? (
          <Section title="Personal details">
            <FormField label="First name" name="firstName" required>
              <Input id="firstName" name="firstName" defaultValue={initial.firstName ?? ""} required autoComplete="given-name" />
            </FormField>
            <FormField label="Middle name" name="middleName">
              <Input id="middleName" name="middleName" defaultValue={initial.middleName ?? ""} />
            </FormField>
            <FormField label="Last name" name="lastName" required>
              <Input id="lastName" name="lastName" defaultValue={initial.lastName ?? ""} required autoComplete="family-name" />
            </FormField>
            <FormField label="Preferred name" name="preferredName" hint="Shown across the app instead of first name">
              <Input id="preferredName" name="preferredName" defaultValue={initial.preferredName ?? ""} />
            </FormField>
            <FormField label="Gender" name="gender">
              <Select id="gender" name="gender" defaultValue={initial.gender ?? "UNDISCLOSED"}>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {cap(g)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Date of birth" name="dateOfBirth">
              <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={d(initial.dateOfBirth)} />
            </FormField>
            <FormField label="Marital status" name="maritalStatus">
              <Select id="maritalStatus" name="maritalStatus" defaultValue={initial.maritalStatus ?? ""}>
                <option value="">Not specified</option>
                {MARITAL_STATUSES.map((m) => (
                  <option key={m} value={m}>
                    {cap(m)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Nationality" name="nationality">
              <Input id="nationality" name="nationality" defaultValue={initial.nationality ?? ""} />
            </FormField>
          </Section>
        ) : null}

        {show("job") ? (
          <Section title="Job details">
            <FormField label="Employee ID" name="employeeCode" required>
              <Input id="employeeCode" name="employeeCode" defaultValue={initial.employeeCode ?? ""} required className="font-mono" />
            </FormField>
            <FormField label="Hire date" name="hireDate" required>
              <Input id="hireDate" name="hireDate" type="date" defaultValue={d(initial.hireDate) || isoDate(new Date())} required />
            </FormField>
            <FormField label="Department" name="departmentId">
              <OptionSelect id="departmentId" name="departmentId" options={options.departments} selected={initial.departmentId} placeholder="No department" />
            </FormField>
            <FormField label="Job title" name="jobTitleId">
              <OptionSelect id="jobTitleId" name="jobTitleId" options={options.jobTitles} selected={initial.jobTitleId} placeholder="No job title" />
            </FormField>
            <FormField label="Location" name="locationId">
              <OptionSelect id="locationId" name="locationId" options={options.locations} selected={initial.locationId} placeholder="No location" />
            </FormField>
            <FormField label="Reports to" name="managerId">
              <OptionSelect id="managerId" name="managerId" options={options.managers.filter((m) => m.id !== id)} selected={initial.managerId} placeholder="No manager" />
            </FormField>
            <FormField label="Employment type" name="employmentType">
              <Select id="employmentType" name="employmentType" defaultValue={initial.employmentType ?? "FULL_TIME"}>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EMPLOYMENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Employment status" name="employmentStatus">
              <Select id="employmentStatus" name="employmentStatus" defaultValue={initial.employmentStatus ?? "ACTIVE"}>
                {EMPLOYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {EMPLOYMENT_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Termination date" name="terminationDate">
              <Input id="terminationDate" name="terminationDate" type="date" defaultValue={d(initial.terminationDate)} />
            </FormField>
            <FormField label="Notes" name="notes" className="sm:col-span-2">
              <Textarea id="notes" name="notes" defaultValue={initial.notes ?? ""} rows={3} />
            </FormField>
          </Section>
        ) : null}

        {show("contact") ? (
          <Section title="Contact details">
            <FormField label="Work email" name="workEmail">
              <Input id="workEmail" name="workEmail" type="email" defaultValue={initial.workEmail ?? ""} autoComplete="email" />
            </FormField>
            <FormField label="Personal email" name="personalEmail">
              <Input id="personalEmail" name="personalEmail" type="email" defaultValue={initial.personalEmail ?? ""} />
            </FormField>
            <FormField label="Phone" name="phone">
              <Input id="phone" name="phone" type="tel" defaultValue={initial.phone ?? ""} />
            </FormField>
            <FormField label="Mobile" name="mobile">
              <Input id="mobile" name="mobile" type="tel" defaultValue={initial.mobile ?? ""} autoComplete="tel" />
            </FormField>
            <FormField label="Address line 1" name="addressLine1" className="sm:col-span-2">
              <Input id="addressLine1" name="addressLine1" defaultValue={initial.addressLine1 ?? ""} autoComplete="address-line1" />
            </FormField>
            <FormField label="Address line 2" name="addressLine2" className="sm:col-span-2">
              <Input id="addressLine2" name="addressLine2" defaultValue={initial.addressLine2 ?? ""} autoComplete="address-line2" />
            </FormField>
            <FormField label="City" name="city">
              <Input id="city" name="city" defaultValue={initial.city ?? ""} />
            </FormField>
            <FormField label="State / Province" name="state">
              <Input id="state" name="state" defaultValue={initial.state ?? ""} />
            </FormField>
            <FormField label="Postal code" name="postalCode">
              <Input id="postalCode" name="postalCode" defaultValue={initial.postalCode ?? ""} />
            </FormField>
            <FormField label="Country" name="country">
              <Input id="country" name="country" defaultValue={initial.country ?? ""} />
            </FormField>
          </Section>
        ) : null}

        {mode === "create" ? <AccountSection /> : null}
      </ActionForm>

      <Dialog open={!!created} onOpenChange={(o) => !o && created && router.push(`/employees/${created.id}`)}>
        {created ? (
          <DialogContent title="Employee created" description={created.initialPassword ? "Share these sign-in details with the employee. The password is shown once." : "No login account was created."}>
            {created.initialPassword ? (
              <div className="rounded-lg bg-slate-50 p-4 font-mono text-sm">
                <p className="text-xs text-slate-500">Temporary password</p>
                <p className="mt-1 select-all text-base font-semibold">{created.initialPassword}</p>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <Button onClick={() => router.push(`/employees/${created.id}`)}>Open profile</Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="grid gap-4 sm:grid-cols-2">{children}</CardBody>
    </Card>
  );
}

function AccountSection() {
  const [create, setCreate] = React.useState(true);
  return (
    <Card>
      <CardHeader title="Login account" description="Lets the employee sign in to the self-service portal" />
      <CardBody className="space-y-4">
        <Checkbox name="createAccount" checked={create} onChange={(e) => setCreate(e.target.checked)} label="Create a login account" />
        {create ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Login email" name="loginEmail" hint="Defaults to work email">
              <Input id="loginEmail" name="loginEmail" type="email" placeholder="Same as work email" />
            </FormField>
            <FormField label="Role" name="role">
              <Select id="role" name="role" defaultValue="EMPLOYEE">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Initial password" name="initialPassword" hint="Leave blank to generate one">
              <Input id="initialPassword" name="initialPassword" type="text" autoComplete="off" />
            </FormField>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function OptionSelect({ options, selected, placeholder, ...props }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "defaultValue"> & { options: Option[]; selected?: string | null; placeholder: string }) {
  return (
    <Select defaultValue={selected ?? ""} {...props}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </Select>
  );
}

const Hidden = ({ name, value }: { name: string; value: string | null | undefined }) => <input type="hidden" name={name} value={value ?? ""} />;

function HiddenPersonal({ initial }: { initial: Initial }) {
  return (
    <>
      <Hidden name="firstName" value={initial.firstName} />
      <Hidden name="middleName" value={initial.middleName} />
      <Hidden name="lastName" value={initial.lastName} />
      <Hidden name="preferredName" value={initial.preferredName} />
      <Hidden name="gender" value={initial.gender ?? "UNDISCLOSED"} />
      <Hidden name="dateOfBirth" value={d(initial.dateOfBirth)} />
      <Hidden name="maritalStatus" value={initial.maritalStatus} />
      <Hidden name="nationality" value={initial.nationality} />
    </>
  );
}
function HiddenJob({ initial }: { initial: Initial }) {
  return (
    <>
      <Hidden name="employeeCode" value={initial.employeeCode} />
      <Hidden name="hireDate" value={d(initial.hireDate)} />
      <Hidden name="departmentId" value={initial.departmentId} />
      <Hidden name="jobTitleId" value={initial.jobTitleId} />
      <Hidden name="locationId" value={initial.locationId} />
      <Hidden name="managerId" value={initial.managerId} />
      <Hidden name="employmentType" value={initial.employmentType ?? "FULL_TIME"} />
      <Hidden name="employmentStatus" value={initial.employmentStatus ?? "ACTIVE"} />
      <Hidden name="terminationDate" value={d(initial.terminationDate)} />
      <Hidden name="notes" value={initial.notes} />
    </>
  );
}
function HiddenContact({ initial }: { initial: Initial }) {
  return (
    <>
      {(["workEmail", "personalEmail", "phone", "mobile", "addressLine1", "addressLine2", "city", "state", "postalCode", "country"] as const).map((k) => (
        <Hidden key={k} name={k} value={initial[k]} />
      ))}
    </>
  );
}
