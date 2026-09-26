import type { Metadata } from "next";
import { headers } from "next/headers";
import { WEEKDAY_SHORT } from "@hris/shared";
import { listShifts } from "@/server/services/attendance";
import { listDevices } from "@/server/services/devices";
import { listLocations } from "@/server/services/org";
import { getSetting } from "@/server/services/settings";
import { deleteShiftAction, saveShiftAction } from "@/server/actions/attendance";
import { EntityManager } from "@/components/entity-manager";
import { Badge } from "@/components/ui/card";
import { PolicyForm } from "./policy-form";
import { Devices } from "./devices";

export const metadata: Metadata = { title: "Attendance settings" };

export default async function AttendanceSettingsPage() {
  const [policy, shifts, devices, locations, h] = await Promise.all([getSetting("attendance"), listShifts(), listDevices(), listLocations(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "your-domain";
  return (
    <div className="space-y-6">
      <PolicyForm policy={policy} />
      <EntityManager
        title="Work shifts"
        description="Used for late, undertime and overtime on the DTR. Employees without a shift use the default."
        singular="shift"
        columns={["Name", "Hours", "Break", "Grace", "Work days", ""]}
        rows={shifts.map((s) => ({
          id: s.id,
          cells: [s.name, `${s.startTime}-${s.endTime}`, `${s.breakMinutes}m`, `${s.graceMinutes}m`, s.workDays.map((d) => WEEKDAY_SHORT[d]).join(" "), s.isDefault ? <Badge key="d" tone="blue">Default</Badge> : `${s._count.employees} assigned`],
          values: { ...s, workDays: s.workDays.join(",") },
        }))}
        fields={[
          { name: "name", label: "Name", required: true, span: 2 },
          { name: "startTime", label: "Start (HH:mm)", required: true, placeholder: "09:00" },
          { name: "endTime", label: "End (HH:mm)", required: true, placeholder: "18:00" },
          { name: "breakMinutes", label: "Break minutes", type: "number", min: 0 },
          { name: "graceMinutes", label: "Grace minutes", type: "number", min: 0, hint: "Minutes before late counts" },
          { name: "workDays", label: "Work days", placeholder: "1,2,3,4,5", hint: "0 = Sun, 1 = Mon ... 6 = Sat", span: 2 },
          { name: "isDefault", label: "Company default shift", type: "checkbox" },
        ]}
        saveAction={saveShiftAction}
        deleteAction={deleteShiftAction}
      />
      <Devices
        host={host}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        devices={devices.map((d) => ({
          id: d.id,
          name: d.name,
          serial: d.serial,
          locationId: d.locationId,
          location: d.location?.name ?? null,
          hasKey: !!d.apiKeyHash,
          lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
          punches: d._count.punches,
        }))}
      />
    </div>
  );
}
