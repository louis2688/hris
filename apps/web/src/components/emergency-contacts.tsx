"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { deleteEmergencyContactAction, saveEmergencyContactAction } from "@/server/actions/employees";
import { ActionForm, ConfirmButton, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Input } from "@/components/ui/input";

type Contact = { id: string; name: string; relationship: string; phone: string; isPrimary: boolean };

export function EmergencyContacts({ employeeId, contacts }: { employeeId: string; contacts: Contact[] }) {
  const [editing, setEditing] = React.useState<Contact | null | "new">(null);
  const save = saveEmergencyContactAction.bind(null, employeeId);
  return (
    <Card>
      <CardHeader
        title="Emergency contacts"
        description="Who we call if something happens"
        action={
          <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
            <Plus /> Add
          </Button>
        }
      />
      {contacts.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">No emergency contacts yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {c.name}
                  {c.isPrimary ? <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">Primary</span> : null}
                </p>
                <p className="text-xs text-slate-500">
                  {c.relationship} · {c.phone}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                Edit
              </Button>
              <ConfirmButton action={() => deleteEmergencyContactAction(employeeId, c.id)} confirm={`Remove ${c.name}?`} variant="ghost" size="icon-sm" className="text-red-600">
                <Trash2 />
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "Add emergency contact" : "Edit emergency contact"}>
          <ActionForm key={editing === "new" ? "new" : editing?.id} action={save} onSuccess={() => setEditing(null)} submitLabel="Save contact">
            {editing && editing !== "new" ? <input type="hidden" name="id" value={editing.id} /> : null}
            <FormField label="Name" name="name" required>
              <Input id="name" name="name" defaultValue={editing !== "new" ? editing?.name : ""} required />
            </FormField>
            <FormField label="Relationship" name="relationship" required>
              <Input id="relationship" name="relationship" placeholder="Spouse, parent, friend" defaultValue={editing !== "new" ? editing?.relationship : ""} required />
            </FormField>
            <FormField label="Phone" name="phone" required>
              <Input id="phone" name="phone" type="tel" defaultValue={editing !== "new" ? editing?.phone : ""} required />
            </FormField>
            <Checkbox name="isPrimary" defaultChecked={editing !== "new" ? editing?.isPrimary : contacts.length === 0} label="Primary contact" />
          </ActionForm>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
