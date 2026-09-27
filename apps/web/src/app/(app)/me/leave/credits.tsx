"use client";

import { createCompOffAction, createEncashmentAction } from "@/server/actions/timeoff";
import { ActionForm, FormField } from "@/components/action-form";
import { EmptyState } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ParamDialog } from "@/components/timeoff-ui";
import { fmtDate } from "@/lib/utils";

const hrs = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

export function CompOffDialog({ eligible, types }: { eligible: { date: string; workedMinutes: number; holiday: string | null }[]; types: { id: string; name: string }[] }) {
  return (
    <ParamDialog param="compoff" label="Claim comp-off" title="Claim compensatory leave" description="For a rest day or holiday you worked. Your manager approves, then the days are added to your balance.">
      {(close) =>
        eligible.length === 0 || types.length === 0 ? (
          <EmptyState title={types.length ? "No worked rest days to claim" : "No compensatory leave type set up"} description={types.length ? "Rest days and holidays with punches in the last 60 days show up here." : "Ask HR to add one in Settings > Leave types."} />
        ) : (
          <ActionForm action={createCompOffAction} onSuccess={close} submitLabel="Send for approval">
            <FormField label="Day worked" name="workDate" required>
              <Select id="workDate" name="workDate" defaultValue={eligible[0]!.date}>
                {eligible.map((e) => (
                  <option key={e.date} value={e.date}>
                    {fmtDate(e.date, "EEE d MMM")} · {e.holiday ?? "Rest day"} · {hrs(e.workedMinutes)}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Credit" name="days" required hint="A whole day needs 4h or more">
                <Select id="days" name="days" defaultValue="1">
                  <option value="1">1 day</option>
                  <option value="0.5">Half day</option>
                </Select>
              </FormField>
              <FormField label="Leave type" name="leaveTypeId" required>
                <Select id="leaveTypeId" name="leaveTypeId" defaultValue={types[0]!.id}>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <FormField label="Reason" name="reason" required>
              <Textarea id="reason" name="reason" rows={2} maxLength={500} placeholder="What you worked on" />
            </FormField>
          </ActionForm>
        )
      }
    </ParamDialog>
  );
}

export function EncashDialog({ types }: { types: { id: string; name: string; available: number }[] }) {
  return (
    <ParamDialog param="encash" label="Convert to cash" title="Convert unused leave to cash" description="HR approves it and the amount is added to your next payroll at your daily rate.">
      {(close) =>
        types.length === 0 ? (
          <EmptyState title="No leave types can be converted" />
        ) : (
          <ActionForm action={createEncashmentAction} onSuccess={close} submitLabel="Send to HR">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Leave type" name="leaveTypeId" required>
                <Select id="leaveTypeId" name="leaveTypeId" defaultValue={types[0]!.id}>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.available} left)
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Days" name="days" required hint="Half-day steps">
                <Input id="days" name="days" type="number" min={0.5} step={0.5} defaultValue={1} />
              </FormField>
            </div>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Up to 10 days of vacation leave a year are tax-exempt (de minimis). The rest is taxed as regular pay.</p>
          </ActionForm>
        )
      }
    </ParamDialog>
  );
}
