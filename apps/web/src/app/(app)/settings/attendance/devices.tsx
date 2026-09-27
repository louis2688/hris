"use client";

import * as React from "react";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteDeviceAction, rotateDeviceKeyAction, saveDeviceAction } from "@/server/actions/attendance";
import { ActionForm, ConfirmButton, FormField } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { fmtDateTime } from "@/lib/utils";

type Device = { id: string; name: string; serial: string; locationId: string | null; location: string | null; hasKey: boolean; lastSeenAt: string | null; punches: number };

export function Devices({ devices, locations, host }: { devices: Device[]; locations: { id: string; name: string }[]; host: string }) {
  const [editing, setEditing] = React.useState<Device | "new" | null>(null);
  const [key, setKey] = React.useState<{ name: string; key: string } | null>(null);
  const [pending, start] = React.useTransition();
  const cur = editing && editing !== "new" ? editing : null;

  return (
    <Card>
      <CardHeader
        title="Biometric terminals"
        description="Fingerprint and face scanners that push punches to Ugnayo"
        action={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Add terminal
          </Button>
        }
      />
      {devices.length === 0 ? (
        <EmptyState title="No terminals yet" description="Register a device by its serial number, then point it at this server." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {devices.map((d) => {
            const online = d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < 10 * 60_000;
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {d.name} <span className="ml-1 font-mono text-xs text-slate-500">{d.serial}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {d.location ?? "No location"} · {d.punches} punches · {d.lastSeenAt ? `seen ${fmtDateTime(d.lastSeenAt)}` : "never connected"}
                  </p>
                </div>
                <Badge tone={online ? "green" : "slate"}>{online ? "Online" : "Offline"}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await rotateDeviceKeyAction(d.id);
                      if (r.ok) setKey({ name: d.name, key: r.data });
                      else toast.error(r.error);
                    })
                  }
                >
                  <KeyRound /> {d.hasKey ? "New API key" : "API key"}
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => setEditing(d)} aria-label="Edit">
                  <Pencil />
                </Button>
                <ConfirmButton action={deleteDeviceAction.bind(null, d.id)} confirm={`Remove ${d.name}? Past punches stay.`} variant="ghost" size="icon-sm" className="text-red-600">
                  <Trash2 />
                </ConfirmButton>
              </li>
            );
          })}
        </ul>
      )}
      <CardBody className="border-t border-slate-100 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Connecting a terminal</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Set each employee's <b>Biometric ID</b> (Employee &gt; Job) to their enroll number on the device.</li>
          <li>
            <b>ZKTeco (ADMS / Cloud Server):</b> Comm &gt; Cloud Server Setting &gt; server address <code className="rounded bg-slate-100 px-1">{host}</code>, port 443, HTTPS on. Serial must match.
          </li>
          <li>
            <b>Other brands or middleware:</b> POST JSON to <code className="rounded bg-slate-100 px-1">/api/v1/attendance/device-punches</code> with header <code className="rounded bg-slate-100 px-1">X-Device-Key</code>.
          </li>
        </ol>
      </CardBody>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={cur ? "Edit terminal" : "Add terminal"}>
          <ActionForm key={cur?.id ?? "new"} action={saveDeviceAction.bind(null, cur?.id)} onSuccess={() => setEditing(null)}>
            <FormField label="Name" name="name" required>
              <Input id="name" name="name" defaultValue={cur?.name ?? ""} placeholder="Lobby scanner" />
            </FormField>
            <FormField label="Serial number" name="serial" required hint="Shown on the device: System > Device info">
              <Input id="serial" name="serial" defaultValue={cur?.serial ?? ""} className="font-mono" />
            </FormField>
            <FormField label="Location" name="locationId" hint="Device clock is read in this location's timezone">
              <Select id="locationId" name="locationId" defaultValue={cur?.locationId ?? ""}>
                <option value="">None (Asia/Manila)</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </ActionForm>
        </DialogContent>
      </Dialog>

      <Dialog open={!!key} onOpenChange={(o) => !o && setKey(null)}>
        {key ? (
          <DialogContent title={`API key for ${key.name}`} description="Copy it now. It is stored hashed and cannot be shown again.">
            <p className="select-all break-all rounded-xl bg-slate-50 p-4 font-mono text-sm">{key.key}</p>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(key.key);
                  toast.success("Copied");
                }}
              >
                Copy
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  );
}
