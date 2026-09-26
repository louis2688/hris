"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { QUALIFICATION_KINDS, QUALIFICATION_LABELS, type QualificationKind } from "@hris/shared";
import { deleteEmployeeQualificationAction, saveEmployeeQualificationAction } from "@/server/actions/qualifications";
import { ActionForm, ConfirmButton, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fmtDate } from "@/lib/utils";

export type EQRow = {
  id: string;
  qualificationId: string;
  level: string | null;
  number: string | null;
  issuedDate: Date | null;
  expiryDate: Date | null;
  amount: string | null;
  notes: string | null;
  qualification: { id: string; name: string; kind: QualificationKind };
};

type Opt = { id: string; name: string; kind: QualificationKind };

const LEVEL_LABEL: Record<QualificationKind, string> = { SKILL: "Proficiency / years", LICENSE: "Issuing body", MEMBERSHIP: "Subscription paid by" };
const NUMBER_LABEL: Record<QualificationKind, string> = { SKILL: "", LICENSE: "License number", MEMBERSHIP: "Membership ID" };
const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function EmployeeQualifications({ employeeId, rows, options }: { employeeId: string; rows: EQRow[]; options: Opt[] }) {
  const [editing, setEditing] = React.useState<{ kind: QualificationKind; row?: EQRow } | null>(null);
  const today = new Date();

  return (
    <div className="stagger grid gap-6">
      {QUALIFICATION_KINDS.map((kind) => {
        const list = rows.filter((r) => r.qualification.kind === kind);
        return (
          <Card key={kind}>
            <CardHeader
              title={`${QUALIFICATION_LABELS[kind]}s`}
              action={
                <Button size="sm" variant="secondary" onClick={() => setEditing({ kind })} disabled={!options.some((o) => o.kind === kind)}>
                  <Plus /> Add
                </Button>
              }
            />
            {list.length === 0 ? (
              <p className="px-5 py-5 text-sm text-slate-500">
                None added.{!options.some((o) => o.kind === kind) ? " HR has not set up any options yet (Settings > Qualifications)." : ""}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.map((r) => {
                  const expired = r.expiryDate && new Date(r.expiryDate) < today;
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {r.qualification.name}
                          {expired ? <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">Expired</span> : null}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {[r.level, r.number, r.issuedDate ? `Issued ${fmtDate(r.issuedDate)}` : null, r.expiryDate ? `Expires ${fmtDate(r.expiryDate)}` : null, r.amount ? `Amount ${r.amount}` : null]
                            .filter(Boolean)
                            .join(" · ") || "-"}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ kind, row: r })}>
                        Edit
                      </Button>
                      <ConfirmButton action={deleteEmployeeQualificationAction.bind(null, employeeId, r.id)} confirm={`Remove ${r.qualification.name}?`} variant="ghost" size="icon-sm" className="text-red-600">
                        <Trash2 />
                      </ConfirmButton>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? (
          <DialogContent title={`${editing.row ? "Edit" : "Add"} ${QUALIFICATION_LABELS[editing.kind].toLowerCase()}`}>
            <ActionForm key={editing.row?.id ?? editing.kind} action={saveEmployeeQualificationAction.bind(null, employeeId)} onSuccess={() => setEditing(null)}>
              {editing.row ? <input type="hidden" name="id" value={editing.row.id} /> : null}
              <FormField label={QUALIFICATION_LABELS[editing.kind]} name="qualificationId" required>
                <Select id="qualificationId" name="qualificationId" defaultValue={editing.row?.qualificationId ?? ""}>
                  <option value="">Select</option>
                  {options
                    .filter((o) => o.kind === editing.kind)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </Select>
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={LEVEL_LABEL[editing.kind]} name="level">
                  <Input id="level" name="level" defaultValue={editing.row?.level ?? ""} />
                </FormField>
                {editing.kind !== "SKILL" ? (
                  <FormField label={NUMBER_LABEL[editing.kind]} name="number">
                    <Input id="number" name="number" defaultValue={editing.row?.number ?? ""} />
                  </FormField>
                ) : null}
                {editing.kind !== "SKILL" ? (
                  <>
                    <FormField label={editing.kind === "MEMBERSHIP" ? "Commence date" : "Issued"} name="issuedDate">
                      <Input id="issuedDate" name="issuedDate" type="date" defaultValue={iso(editing.row?.issuedDate ?? null)} />
                    </FormField>
                    <FormField label={editing.kind === "MEMBERSHIP" ? "Renewal date" : "Expiry"} name="expiryDate">
                      <Input id="expiryDate" name="expiryDate" type="date" defaultValue={iso(editing.row?.expiryDate ?? null)} />
                    </FormField>
                  </>
                ) : null}
                {editing.kind === "MEMBERSHIP" ? (
                  <FormField label="Subscription amount" name="amount">
                    <Input id="amount" name="amount" type="number" step="0.01" min={0} defaultValue={editing.row?.amount ?? ""} />
                  </FormField>
                ) : null}
              </div>
              <FormField label="Notes" name="notes">
                <Textarea id="notes" name="notes" rows={2} defaultValue={editing.row?.notes ?? ""} />
              </FormField>
            </ActionForm>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
