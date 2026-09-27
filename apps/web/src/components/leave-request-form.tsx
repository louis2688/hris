"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { countLeaveDays, DAY_PARTS, DAY_PART_LABELS, type DayPart, type LeaveBalance } from "@hris/shared";
import { createLeaveRequestAction } from "@/server/actions/leave";
import { ActionForm, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { todayISO } from "@/lib/utils";

type LeaveTypeOpt = { id: string; name: string; allowHalfDay: boolean; requiresApproval: boolean; isPaid: boolean };
type EmployeeOpt = { id: string; name: string };

export function LeaveRequestForm({
  types,
  balances,
  holidays,
  employees,
  defaultEmployeeId,
  blocks = [],
  onDone,
}: {
  types: LeaveTypeOpt[];
  balances: LeaveBalance[];
  holidays: string[];
  /** HR/Admin only: file on behalf of someone. */
  employees?: EmployeeOpt[];
  defaultEmployeeId?: string;
  /** Upcoming leave block dates (ISO) that apply to the requester. */
  blocks?: { name: string; from: string; to: string }[];
  onDone?: () => void;
}) {
  const today = todayISO();
  const [typeId, setTypeId] = React.useState(types[0]?.id ?? "");
  const [start, setStart] = React.useState(today);
  const [end, setEnd] = React.useState(today);
  const [sp, setSp] = React.useState<DayPart>("FULL");
  const [ep, setEp] = React.useState<DayPart>("FULL");
  const type = types.find((t) => t.id === typeId);
  const startYear = Number(start.slice(0, 4));
  const bal = balances.find((b) => b.leaveTypeId === typeId && b.year === startYear);
  const days = start && end ? countLeaveDays(start, end, sp, ep, { holidays }) : 0;
  const single = start === end;
  const over = !!(type?.isPaid && bal && days > bal.available);
  const blocked = blocks.find((b) => b.from <= end && b.to >= start);

  return (
    <ActionForm action={createLeaveRequestAction} submitLabel="Submit request" onSuccess={onDone}>
      {employees ? (
        <FormField label="Employee" name="employeeId" required>
          <Select id="employeeId" name="employeeId" defaultValue={defaultEmployeeId ?? ""}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}
      <FormField label="Leave type" name="leaveTypeId" required>
        <Select id="leaveTypeId" name="leaveTypeId" value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {balances.find((b) => b.leaveTypeId === t.id && b.year === startYear) ? ` (${balances.find((b) => b.leaveTypeId === t.id && b.year === startYear)!.available} left)` : ""}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="From" name="startDate" required>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (e.target.value > end) setEnd(e.target.value);
            }}
            required
          />
        </FormField>
        <FormField label="To" name="endDate" required>
          <Input id="endDate" name="endDate" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
        </FormField>
        {type?.allowHalfDay ? (
          <>
            <FormField label={single ? "Duration" : "First day"} name="startDayPart">
              <Select
                id="startDayPart"
                name="startDayPart"
                value={sp}
                onChange={(e) => {
                  setSp(e.target.value as DayPart);
                  if (single) setEp("FULL");
                }}
              >
                {DAY_PARTS.map((p) => (
                  <option key={p} value={p}>
                    {DAY_PART_LABELS[p]}
                  </option>
                ))}
              </Select>
            </FormField>
            {!single ? (
              <FormField label="Last day" name="endDayPart">
                <Select id="endDayPart" name="endDayPart" value={ep} onChange={(e) => setEp(e.target.value as DayPart)}>
                  {(["FULL", "AM"] as DayPart[]).map((p) => (
                    <option key={p} value={p}>
                      {DAY_PART_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <input type="hidden" name="endDayPart" value="FULL" />
            )}
          </>
        ) : (
          <>
            <input type="hidden" name="startDayPart" value="FULL" />
            <input type="hidden" name="endDayPart" value="FULL" />
          </>
        )}
      </div>
      {blocks.length ? (
        <div className={`rounded-lg px-3 py-2 text-xs ${blocked ? "bg-tone-red-bg text-tone-red-fg" : "bg-tone-amber-bg text-tone-amber-fg"}`} role={blocked ? "alert" : undefined}>
          <strong className="font-semibold">{blocked ? `Blocked: ${blocked.name}` : "Leave is blocked on"}</strong>
          {blocked ? " - pick other dates." : null}
          <ul className="mt-0.5">
            {blocks.slice(0, 3).map((b) => (
              <li key={`${b.from}${b.name}`}>
                {b.from === b.to ? b.from : `${b.from} to ${b.to}`} · {b.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className={`rounded-lg px-3 py-2 text-sm ${over ? "bg-tone-red-bg text-tone-red-fg" : "bg-slate-50 text-slate-700"}`}>
        <strong>{days}</strong> working day{days === 1 ? "" : "s"} requested
        {bal ? ` · ${bal.available} available` : ""}
        {over ? " · exceeds your balance" : ""}
        {type && !type.requiresApproval ? " · approved automatically" : ""}
        <span className="block text-xs text-slate-500">Weekends and public holidays are not counted.</span>
      </div>
      <FormField label="Reason" name="reason" hint="Optional, visible to your approver">
        <Textarea id="reason" name="reason" rows={3} maxLength={1000} />
      </FormField>
    </ActionForm>
  );
}

/** "Request leave" button + dialog, opens automatically when ?new=1 is in the URL. */
export function RequestLeaveDialog(props: React.ComponentProps<typeof LeaveRequestForm> & { label?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = React.useState(params.get("new") === "1");
  const close = () => {
    setOpen(false);
    if (params.get("new")) router.replace(window.location.pathname);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>{props.label ?? "Request leave"}</Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent title="Request leave">
          <LeaveRequestForm {...props} defaultEmployeeId={props.defaultEmployeeId ?? params.get("employeeId") ?? undefined} onDone={close} />
        </DialogContent>
      </Dialog>
    </>
  );
}
