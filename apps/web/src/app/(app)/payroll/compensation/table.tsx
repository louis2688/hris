"use client";

import * as React from "react";
import Link from "next/link";
import { History, Pencil } from "lucide-react";
import { maskAccount } from "@hris/shared";
import { saveCompensationAction } from "@/server/actions/payroll";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Row = {
  id: string;
  name: string;
  code: string;
  department: string | null;
  payType: "MONTHLY" | "DAILY";
  basicPay: number | null;
  allowance: number;
  tin: string | null;
  sssNo: string | null;
  philhealthNo: string | null;
  pagibigNo: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  upcoming: { date: string; basicPay: number } | null;
};

const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function CompensationTable({ rows, today }: { rows: Row[]; today: string }) {
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState<Row | null>(null);
  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => `${r.name} ${r.code} ${r.department ?? ""}`.toLowerCase().includes(needle)) : rows;

  return (
    <Card>
      <div className="border-b border-slate-100 px-5 py-4">
        <Input type="search" placeholder="Search name, code or department" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" aria-label="Search employees" />
      </div>
      <Table className="min-w-[1080px]">
        <THead>
          <tr>
            <TH>Employee</TH>
            <TH>Pay type</TH>
            <TH className="text-right">Basic pay</TH>
            <TH className="text-right">Allowance / mo</TH>
            <TH>TIN</TH>
            <TH>SSS</TH>
            <TH>PhilHealth</TH>
            <TH>Pag-IBIG</TH>
            <TH>Bank</TH>
            <TH className="w-20" />
          </tr>
        </THead>
        <TBody>
          {shown.map((r) => (
            <TR key={r.id}>
              <TD className="whitespace-nowrap">
                <span className="font-medium text-ink">{r.name}</span>
                <span className="block text-xs text-slate-500">
                  {r.code}
                  {r.department ? ` · ${r.department}` : ""}
                </span>
              </TD>
              <TD>{r.payType === "DAILY" ? "Daily" : "Monthly"}</TD>
              <TD className="whitespace-nowrap text-right tabular-nums">
                {r.basicPay == null ? <Badge tone="amber">Not set</Badge> : `${php.format(r.basicPay)}${r.payType === "DAILY" ? " /day" : ""}`}
                {r.upcoming ? <span className="block text-xs text-tone-blue-fg">{php.format(r.upcoming.basicPay)} from {r.upcoming.date}</span> : null}
              </TD>
              <TD className="text-right tabular-nums">{r.allowance ? php.format(r.allowance) : "-"}</TD>
              <TD className="whitespace-nowrap font-mono text-xs">{r.tin ?? "-"}</TD>
              <TD className="whitespace-nowrap font-mono text-xs">{r.sssNo ?? "-"}</TD>
              <TD className="whitespace-nowrap font-mono text-xs">{r.philhealthNo ?? "-"}</TD>
              <TD className="whitespace-nowrap font-mono text-xs">{r.pagibigNo ?? "-"}</TD>
              <TD className="whitespace-nowrap text-xs">
                {r.bankName ?? "-"}
                {r.bankAccountNo ? <span className="block font-mono text-slate-500">{maskAccount(r.bankAccountNo)}</span> : null}
              </TD>
              <TD className="whitespace-nowrap text-right">
                <Link href={`/payroll/compensation/${r.id}`} className="inline-flex size-8 items-center justify-center rounded-full text-ink hover:bg-ink/5" aria-label={`Salary history for ${r.name}`}>
                  <History className="size-4" />
                </Link>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(r)} aria-label={`Edit compensation for ${r.name}`}>
                  <Pencil />
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {shown.length === 0 ? <p className="px-5 py-6 text-center text-sm text-slate-500">No employees match.</p> : null}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title="Edit compensation" description={editing ? `${editing.name} (${editing.code})` : undefined}>
          {editing ? (
            <ActionForm key={editing.id} action={saveCompensationAction.bind(null, editing.id)} onSuccess={() => setEditing(null)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Effective from" name="effectiveFrom" required hint="Pay changes apply from this date; earlier cutoffs keep the old pay.">
                  <Input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={today} />
                </FormField>
                <FormField label="Reason" name="reason" hint="e.g. Annual increase, Promotion">
                  <Input id="reason" name="reason" maxLength={200} />
                </FormField>
                <FormField label="Pay type" name="payType" required>
                  <Select id="payType" name="payType" defaultValue={editing.payType}>
                    <option value="MONTHLY">Monthly salary</option>
                    <option value="DAILY">Daily rate</option>
                  </Select>
                </FormField>
                <FormField label="Basic pay (PHP)" name="basicPay" hint="Monthly salary or daily rate. Blank = excluded from payroll.">
                  <Input id="basicPay" name="basicPay" type="number" step="0.01" min={0} inputMode="decimal" defaultValue={editing.basicPay ?? ""} />
                </FormField>
                <FormField label="De minimis allowance / month" name="allowance" hint="Non-taxable" className="sm:col-span-2">
                  <Input id="allowance" name="allowance" type="number" step="0.01" min={0} inputMode="decimal" defaultValue={editing.allowance || ""} />
                </FormField>
                <FormField label="TIN" name="tin">
                  <Input id="tin" name="tin" placeholder="000-000-000-000" defaultValue={editing.tin ?? ""} />
                </FormField>
                <FormField label="SSS no." name="sssNo">
                  <Input id="sssNo" name="sssNo" placeholder="00-0000000-0" defaultValue={editing.sssNo ?? ""} />
                </FormField>
                <FormField label="PhilHealth no." name="philhealthNo">
                  <Input id="philhealthNo" name="philhealthNo" placeholder="00-000000000-0" defaultValue={editing.philhealthNo ?? ""} />
                </FormField>
                <FormField label="Pag-IBIG MID no." name="pagibigNo">
                  <Input id="pagibigNo" name="pagibigNo" placeholder="0000-0000-0000" defaultValue={editing.pagibigNo ?? ""} />
                </FormField>
                <FormField label="Bank" name="bankName">
                  <Input id="bankName" name="bankName" placeholder="BDO, BPI, Metrobank..." defaultValue={editing.bankName ?? ""} />
                </FormField>
                <FormField label="Account no." name="bankAccountNo">
                  <Input id="bankAccountNo" name="bankAccountNo" inputMode="numeric" autoComplete="off" defaultValue={editing.bankAccountNo ?? ""} />
                </FormField>
              </div>
            </ActionForm>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
