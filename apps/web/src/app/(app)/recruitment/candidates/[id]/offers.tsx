"use client";

import * as React from "react";
import { Copy, FilePlus2, FileText, Link2, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_OFFER_TERMS, EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS, OFFER_STATUS_TONE, type OfferStatus, type OfferTerm } from "@hris/shared";
import { saveOfferAction, sendOfferAction, withdrawOfferAction } from "@/server/actions/offers";
import { ActionForm, ConfirmButton, FormField } from "@/components/action-form";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { fmtDate } from "@/lib/utils";
import { ValidateFirst } from "@/app/careers/validate-first";

export type OfferRow = {
  id: string;
  status: OfferStatus;
  jobTitleId: string | null;
  departmentId: string | null;
  jobTitle: string | null;
  department: string | null;
  employmentType: (typeof EMPLOYMENT_TYPES)[number];
  payType: "MONTHLY" | "DAILY";
  basicPay: number;
  allowance: number;
  startDate: string;
  expiresAt: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  signatureName: string | null;
  declineReason: string | null;
  terms: OfferTerm[];
  link: string | null;
};
type Opt = { id: string; name: string };

const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const iso = (s: string | null) => (s ? s.slice(0, 10) : "");

export function Offers({
  candidateId,
  offers,
  canCreate,
  hired,
  defaults,
  jobTitles,
  departments,
}: {
  candidateId: string;
  offers: OfferRow[];
  canCreate: boolean;
  hired: boolean;
  defaults: { jobTitleId: string | null; departmentId: string | null };
  jobTitles: Opt[];
  departments: Opt[];
}) {
  const [editing, setEditing] = React.useState<OfferRow | "new" | null>(null);
  const [sent, setSent] = React.useState<{ link: string; emailed: boolean } | null>(null);
  const [pending, start] = React.useTransition();
  const open = offers.some((o) => ["DRAFT", "SENT", "ACCEPTED"].includes(o.status));

  const send = (o: OfferRow) =>
    start(async () => {
      const r = await sendOfferAction(candidateId, o.id);
      if (!r.ok) return void toast.error(r.error);
      setSent(r.data);
    });
  const copy = (link: string) => navigator.clipboard.writeText(link).then(() => toast.success("Link copied"), () => toast.error("Copy failed; select the link instead"));

  return (
    <Card>
      <CardHeader
        title="Job offer"
        description={open ? undefined : "Draft the offer, then send the candidate a secure link to accept."}
        action={
          canCreate && !open ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
              <FilePlus2 /> New offer
            </Button>
          ) : null
        }
      />
      {offers.length === 0 ? (
        <EmptyState title="No offer yet" description={canCreate ? undefined : "Move the candidate to interview first."} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {offers.map((o) => (
            <li key={o.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {o.jobTitle ?? "Offer"} · {php.format(o.basicPay)}
                    <span className="font-normal text-slate-500">{o.payType === "DAILY" ? " / day" : " / month"}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Starts {fmtDate(o.startDate)}
                    {o.expiresAt ? ` · expires ${fmtDate(o.expiresAt)}` : ""}
                    {o.sentAt ? ` · sent ${fmtDate(o.sentAt)}` : ""}
                  </p>
                </div>
                <Badge tone={OFFER_STATUS_TONE[o.status]}>{o.status.toLowerCase()}</Badge>
              </div>
              {o.status === "ACCEPTED" ? (
                <p className="mt-2 text-sm text-tone-green-fg">
                  Signed as <span className="font-serif font-semibold">{o.signatureName}</span> on {fmtDate(o.respondedAt)}.{hired ? "" : " Ready to hire."}
                </p>
              ) : o.status === "DECLINED" ? (
                <p className="mt-2 text-sm text-slate-600">Declined {fmtDate(o.respondedAt)}{o.declineReason ? `: "${o.declineReason}"` : ""}</p>
              ) : null}
              {o.link ? (
                <div className="mt-3 flex items-center gap-2 rounded-full bg-bone py-1 pl-4 pr-1">
                  <Link2 className="size-4 shrink-0 text-slate-500" aria-hidden />
                  <input readOnly value={o.link} aria-label="Offer link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent font-mono text-xs text-slate-700 outline-none" />
                  <Button size="sm" variant="ghost" onClick={() => copy(o.link!)}>
                    <Copy /> Copy
                  </Button>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {o.status === "DRAFT" ? (
                  <>
                    <Button size="sm" variant="brand" onClick={() => send(o)} loading={pending}>
                      <Send /> Send offer
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(o)}>
                      <Pencil /> Edit
                    </Button>
                  </>
                ) : null}
                <a href={`/recruitment/offers/${o.id}/letter`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                  <FileText /> Offer letter
                </a>
                {o.status === "ACCEPTED" && hired ? (
                  <a href={`/recruitment/offers/${o.id}/appointment`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                    <FileText /> Appointment letter
                  </a>
                ) : null}
                {["DRAFT", "SENT", "EXPIRED"].includes(o.status) || (o.status === "ACCEPTED" && !hired) ? (
                  <ConfirmButton action={withdrawOfferAction.bind(null, candidateId, o.id)} confirm="Withdraw this offer? The candidate's link will stop working." variant="ghost" size="sm" className="text-red-600">
                    <Undo2 /> Withdraw
                  </ConfirmButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? (
          <DialogContent title={editing === "new" ? "New job offer" : "Edit offer"} description="Saved as a draft. Nothing is sent until you click Send offer." className="sm:max-w-2xl">
            <OfferForm candidateId={candidateId} offer={editing === "new" ? undefined : editing} defaults={defaults} jobTitles={jobTitles} departments={departments} onDone={() => setEditing(null)} />
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={!!sent} onOpenChange={(o) => !o && setSent(null)}>
        {sent ? (
          <DialogContent title="Offer sent" description={sent.emailed ? "We emailed the candidate this link." : "Email isn't configured, so send the candidate this link yourself."}>
            <div className="space-y-4">
              <div className="rounded-xl bg-bone p-3">
                <input readOnly value={sent.link} aria-label="Offer link" onFocus={(e) => e.currentTarget.select()} className="w-full bg-transparent font-mono text-xs text-ink outline-none" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => copy(sent.link)}>
                  <Copy /> Copy link
                </Button>
                <Button onClick={() => setSent(null)}>Done</Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  );
}

function OfferForm({ candidateId, offer, defaults, jobTitles, departments, onDone }: { candidateId: string; offer?: OfferRow; defaults: { jobTitleId: string | null; departmentId: string | null }; jobTitles: Opt[]; departments: Opt[]; onDone: () => void }) {
  const [terms, setTerms] = React.useState<(OfferTerm & { k: number })[]>(() => (offer?.terms ?? DEFAULT_OFFER_TERMS).map((t, k) => ({ ...t, k })));
  const nextKey = React.useRef(terms.length);
  return (
    <ValidateFirst>
    <ActionForm action={saveOfferAction.bind(null, candidateId, offer?.id)} onSuccess={onDone} submitLabel={offer ? "Save draft" : "Create draft"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Job title" name="jobTitleId">
          <Select id="jobTitleId" name="jobTitleId" defaultValue={offer?.jobTitleId ?? defaults.jobTitleId ?? ""}>
            <option value="">None</option>
            {jobTitles.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Department" name="departmentId">
          <Select id="departmentId" name="departmentId" defaultValue={offer?.departmentId ?? defaults.departmentId ?? ""}>
            <option value="">None</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Employment type" name="employmentType">
          <Select id="employmentType" name="employmentType" defaultValue={offer?.employmentType ?? "FULL_TIME"}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Pay type" name="payType">
          <Select id="payType" name="payType" defaultValue={offer?.payType ?? "MONTHLY"}>
            <option value="MONTHLY">Monthly salary</option>
            <option value="DAILY">Daily rate</option>
          </Select>
        </FormField>
        <FormField label="Basic pay (PHP)" name="basicPay" required>
          <Input id="basicPay" name="basicPay" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={offer?.basicPay ?? ""} required />
        </FormField>
        <FormField label="Allowance per month (PHP)" name="allowance" hint="Non-taxable de minimis">
          <Input id="allowance" name="allowance" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={offer?.allowance ?? 0} />
        </FormField>
        <FormField label="Start date" name="startDate" required>
          <Input id="startDate" name="startDate" type="date" defaultValue={iso(offer?.startDate ?? null)} required />
        </FormField>
        <FormField label="Offer expires" name="expiresAt" hint="Candidate can respond until the end of this day">
          <Input id="expiresAt" name="expiresAt" type="date" defaultValue={iso(offer?.expiresAt ?? null)} />
        </FormField>
      </div>
      <fieldset className="rounded-2xl bg-bone p-3 sm:p-4">
        <legend className="sr-only">Terms</legend>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">Terms and benefits</p>
          <Button type="button" size="sm" variant="ghost" onClick={() => setTerms((t) => [...t, { label: "", value: "", k: nextKey.current++ }])}>
            <Plus /> Add term
          </Button>
        </div>
        <div className="space-y-2">
          {terms.map((t, i) => (
            <div key={t.k} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[180px_1fr_auto]">
              <Input name="termLabel" defaultValue={t.label} placeholder="Label" aria-label={`Term ${i + 1} label`} className="h-10" />
              <Input name="termValue" defaultValue={t.value} placeholder="Details" aria-label={`Term ${i + 1} details`} className="order-3 col-span-2 h-10 sm:order-none sm:col-span-1" />
              <Button type="button" size="icon" variant="ghost" className="size-10 text-slate-500" aria-label={`Remove term ${i + 1}`} onClick={() => setTerms((x) => x.filter((y) => y.k !== t.k))}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </fieldset>
    </ActionForm>
    </ValidateFirst>
  );
}
