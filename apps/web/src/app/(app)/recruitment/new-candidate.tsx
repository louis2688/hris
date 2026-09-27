"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { saveCandidateAction } from "@/server/actions/recruitment";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";

export type CandidateInitial = { firstName: string; lastName: string; email: string; phone: string | null; vacancyId: string | null; source: string | null; resumeUrl: string | null; notes: string | null; referrerId?: string | null };
type Opt = { id: string; name: string };

export function CandidateForm({ id, initial, vacancies, people = [], onDone }: { id?: string; initial?: CandidateInitial; vacancies: Opt[]; people?: Opt[]; onDone: (id: string) => void }) {
  return (
    <ActionForm action={saveCandidateAction.bind(null, id)} onSuccess={(d: { id: string }) => onDone(d.id)} submitLabel={id ? "Save" : "Add candidate"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="First name" name="firstName" required>
          <Input id="firstName" name="firstName" defaultValue={initial?.firstName} />
        </FormField>
        <FormField label="Last name" name="lastName" required>
          <Input id="lastName" name="lastName" defaultValue={initial?.lastName} />
        </FormField>
        <FormField label="Email" name="email" required>
          <Input id="email" name="email" type="email" defaultValue={initial?.email} />
        </FormField>
        <FormField label="Phone" name="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={initial?.phone ?? ""} />
        </FormField>
        <FormField label="Vacancy" name="vacancyId">
          <Select id="vacancyId" name="vacancyId" defaultValue={initial?.vacancyId ?? ""}>
            <option value="">None</option>
            {vacancies.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Source" name="source">
          <Input id="source" name="source" list="sources" defaultValue={initial?.source ?? ""} placeholder="JobStreet, LinkedIn, referral" />
          <datalist id="sources">
            {["JobStreet", "LinkedIn", "Indeed", "Kalibrr", "Referral", "Walk-in", "Company website"].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Referred by" name="referrerId" hint="Earns the vacancy's referral bonus after 90 days">
          <Select id="referrerId" name="referrerId" defaultValue={initial?.referrerId ?? ""}>
            <option value="">No referrer</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Resume link" name="resumeUrl" hint="Google Drive / Dropbox link">
          <Input id="resumeUrl" name="resumeUrl" type="url" defaultValue={initial?.resumeUrl ?? ""} />
        </FormField>
        <FormField label="Notes" name="notes" className="sm:col-span-2">
          <Textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} />
        </FormField>
      </div>
    </ActionForm>
  );
}

export function NewCandidate({ vacancies, people }: { vacancies: Opt[]; people?: Opt[] }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus /> Add candidate
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add candidate">
          <CandidateForm vacancies={vacancies} people={people} onDone={(id) => router.push(`/recruitment/candidates/${id}`)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
