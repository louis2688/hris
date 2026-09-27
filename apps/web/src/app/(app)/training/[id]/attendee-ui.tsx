"use client";

import * as React from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { attendanceAction, certificateAction, inviteAction, removeAttendeeAction } from "@/server/actions/growth";
import { ActionForm, ConfirmButton, useFormCtx } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmployeePicker, type PickPerson } from "../../performance/employee-picker";

export type AttendeeView = {
  id: string;
  name: string;
  dept: string | null;
  status: "INVITED" | "ATTENDED" | "ABSENT";
  result: string | null;
  score: number | null;
  certificate: { id: string; name: string } | null;
};

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormCtx();
  return (
    <Button type="submit" size="sm" variant="secondary" loading={pending}>
      {children}
    </Button>
  );
}

export function InviteForm({ eventId, people, departments, seatsLeft }: { eventId: string; people: PickPerson[]; departments: { id: string; name: string }[]; seatsLeft: number | null }) {
  const [k, setK] = React.useState(0);
  return (
    <ActionForm key={k} action={inviteAction.bind(null, eventId)} onSuccess={() => setK((x) => x + 1)} submitLabel="Send invites">
      <EmployeePicker name="employeeIds" people={people} departments={departments} max={seatsLeft ?? undefined} />
    </ActionForm>
  );
}

export function AttendeeRow({ a }: { a: AttendeeView }) {
  const sid = `st-${a.id}`;
  return (
    <li className="px-4 py-3 sm:px-5" data-attendee={a.name}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{a.name}</p>
          {a.dept ? <p className="text-xs text-slate-500">{a.dept}</p> : null}
        </div>
        {a.certificate ? (
          <a href={`/api/v1/documents/${a.certificate.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
            <FileText className="size-3.5" aria-hidden /> Certificate
          </a>
        ) : null}
        <ConfirmButton action={() => removeAttendeeAction(a.id)} confirm={`Remove ${a.name} from this event?`} variant="ghost" size="icon-sm" className="text-tone-red-fg">
          <Trash2 />
          <span className="sr-only">Remove {a.name}</span>
        </ConfirmButton>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ActionForm action={attendanceAction.bind(null, a.id)} hideSubmit className="flex flex-wrap items-center gap-2 space-y-0">
          <label htmlFor={sid} className="sr-only">
            Attendance for {a.name}
          </label>
          <Select id={sid} name="status" defaultValue={a.status} className="h-8 w-auto py-0 pl-3 text-xs">
            <option value="INVITED">Invited</option>
            <option value="ATTENDED">Attended</option>
            <option value="ABSENT">Absent</option>
          </Select>
          <Input name="result" list="training-results" defaultValue={a.result ?? ""} placeholder="Result" aria-label={`Result for ${a.name}`} className="h-8 w-28 px-3 text-xs" />
          <Input name="score" type="number" min={0} max={100} defaultValue={a.score ?? ""} placeholder="Score" aria-label={`Score for ${a.name}`} className="h-8 w-20 px-3 text-xs" />
          <Submit>Save</Submit>
        </ActionForm>
        {a.status === "ATTENDED" ? (
          <ActionForm action={certificateAction.bind(null, a.id)} hideSubmit resetOnSuccess className="flex items-center gap-2 space-y-0">
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium text-ink ring-1 ring-inset ring-hairline hover:bg-canvas has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-focus">
              <Upload className="size-3.5" aria-hidden />
              <span>{a.certificate ? "Replace certificate" : "Certificate PDF"}</span>
              <input
                type="file"
                name="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="sr-only"
                aria-label={`Certificate for ${a.name}`}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              />
            </label>
          </ActionForm>
        ) : null}
      </div>
    </li>
  );
}
