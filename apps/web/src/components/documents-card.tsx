"use client";

import * as React from "react";
import { File, FileImage, FileSpreadsheet, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { DocumentCategory } from "@hris/db";
import { deleteDocumentAction, uploadDocumentAction } from "@/server/actions/documents";
import { acknowledgeDocumentAction } from "@/server/actions/lifecycle";
import { ActionForm, ConfirmButton, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { fmtDate } from "@/lib/utils";

const MAX = 5 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx";

const CATEGORY: Record<DocumentCategory, { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }> = {
  CONTRACT: { label: "Contract", tone: "blue" },
  ID: { label: "ID", tone: "violet" },
  RESUME: { label: "Resume", tone: "slate" },
  CERTIFICATE: { label: "Certificate", tone: "green" },
  PAYSLIP: { label: "Payslip", tone: "amber" },
  OTHER: { label: "Other", tone: "slate" },
};

export type DocItem = {
  id: string;
  name: string;
  category: DocumentCategory;
  mimeType: string;
  size: number;
  visibleToEmployee: boolean;
  createdAt: Date;
  canDelete: boolean;
  expiresAt?: Date | null;
  requiresAck?: boolean;
  acks?: { ackedAt: Date }[];
  uploadedBy: { email: string; employee: { firstName: string; lastName: string; preferredName: string | null } | null } | null;
};

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

const DAY = 86_400_000;
const manilaToday = () => new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }));

/** Expired / expiring within 30 days / valid-until badge. expiresAt is a date-only (UTC midnight) value. */
function ExpiryBadge({ at }: { at: Date }) {
  const days = Math.round((new Date(at).getTime() - manilaToday().getTime()) / DAY);
  if (days < 0) return <Badge tone="red">Expired {fmtDate(at)}</Badge>;
  if (days === 0) return <Badge tone="red">Expires today</Badge>;
  if (days <= 30) return <Badge tone="amber">Expires in {days} day{days === 1 ? "" : "s"}</Badge>;
  return <Badge tone="slate">Valid to {fmtDate(at)}</Badge>;
}

function DocIcon({ mime }: { mime: string }) {
  const I = mime.startsWith("image/") ? FileImage : mime === "application/pdf" ? FileText : mime.includes("spreadsheet") ? FileSpreadsheet : File;
  return <I className="size-5 shrink-0 text-slate-400" aria-hidden />;
}

export function DocumentsCard({
  docs,
  employeeId,
  candidateId,
  categories,
  staff = false,
  description,
  canAck = false,
}: {
  docs: DocItem[];
  employeeId?: string;
  candidateId?: string;
  /** Categories the viewer may upload; empty = view only. */
  categories: DocumentCategory[];
  /** Shows the "visible to employee" toggle and hidden badge. */
  staff?: boolean;
  description?: string;
  /** The viewer is the employee and may acknowledge must-read documents. */
  canAck?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Card>
      <CardHeader
        title="Documents"
        description={description}
        action={
          categories.length ? (
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
              <Upload /> Upload
            </Button>
          ) : undefined
        }
      />
      {docs.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">No documents yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {docs.map((d) => {
            const by = d.uploadedBy?.employee ? `${d.uploadedBy.employee.preferredName ?? d.uploadedBy.employee.firstName} ${d.uploadedBy.employee.lastName}` : (d.uploadedBy?.email ?? "Unknown");
            return (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                <DocIcon mime={d.mimeType} />
                <div className="min-w-0 flex-1">
                  <a href={`/api/v1/documents/${d.id}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-brand-700 hover:underline">
                    {d.name}
                  </a>
                  <p className="text-xs text-slate-500">
                    {fmtSize(d.size)} · {by} · {fmtDate(d.createdAt)}
                    {d.requiresAck ? (d.acks?.length ? ` · Acknowledged on ${fmtDate(d.acks[0]!.ackedAt)}` : " · Not yet acknowledged") : null}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5 sm:hidden">
                    <Badges d={d} staff={staff && !!employeeId} />
                  </div>
                </div>
                <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
                  <Badges d={d} staff={staff && !!employeeId} />
                </div>
                {canAck && d.requiresAck && !d.acks?.length ? (
                  <ConfirmButton action={() => acknowledgeDocumentAction(d.id)} confirm={`Confirm you have read and understood ${d.name}?`} size="sm" variant="secondary">
                    Acknowledge
                  </ConfirmButton>
                ) : null}
                {d.canDelete ? (
                  <ConfirmButton action={() => deleteDocumentAction(d.id)} confirm={`Delete ${d.name}?`} variant="ghost" size="icon-sm" className="text-red-600">
                    <Trash2 aria-label="Delete" />
                  </ConfirmButton>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Upload document" description="PDF, JPG, PNG, WEBP, DOCX or XLSX, up to 5 MB.">
          <ActionForm action={uploadDocumentAction} onSuccess={() => setOpen(false)} resetOnSuccess submitLabel="Upload">
            {employeeId ? <input type="hidden" name="employeeId" value={employeeId} /> : null}
            {candidateId ? <input type="hidden" name="candidateId" value={candidateId} /> : null}
            <FormField label="File" name="file" required>
              {/* ponytail: native file input already accepts drag-and-drop; no custom drop zone. */}
              <input
                id="file"
                name="file"
                type="file"
                accept={ACCEPT}
                required
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (f && f.size > MAX) {
                    toast.error("File is larger than 5 MB");
                    e.currentTarget.value = "";
                  }
                }}
              />
            </FormField>
            <FormField label="Category" name="category" required>
              <Select id="category" name="category" defaultValue={categories[0]}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY[c].label}
                  </option>
                ))}
              </Select>
            </FormField>
            {employeeId ? (
              <FormField label="Expires on" name="expiresAt" hint="Optional. HR and the employee get reminders 30 and 7 days before.">
                <Input id="expiresAt" name="expiresAt" type="date" />
              </FormField>
            ) : null}
            {staff && employeeId ? (
              <>
                <input type="hidden" name="visibleToEmployee" value="false" />
                <Checkbox name="visibleToEmployee" value="true" defaultChecked label="Visible to employee" />
                <Checkbox name="requiresAck" value="true" label="Employee must acknowledge" />
              </>
            ) : null}
          </ActionForm>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Badges({ d, staff }: { d: DocItem; staff: boolean }) {
  return (
    <>
      <Badge tone={CATEGORY[d.category].tone}>{CATEGORY[d.category].label}</Badge>
      {d.expiresAt ? <ExpiryBadge at={d.expiresAt} /> : null}
      {d.requiresAck && !d.acks?.length ? <Badge tone="amber">Needs acknowledgment</Badge> : null}
      {staff && !d.visibleToEmployee ? <Badge tone="red">HR only</Badge> : null}
    </>
  );
}
