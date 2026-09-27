"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { passkeyDeleteAction, passkeyRegisterAction, passkeyRegisterOptionsAction } from "@/server/actions/attendance";
import { ConfirmButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fmtDateTime } from "@/lib/utils";

type Key = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

function guessDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone (Face ID / Touch ID)";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone (fingerprint / face)";
  if (/Mac/.test(ua)) return "Mac (Touch ID)";
  if (/Windows/.test(ua)) return "Windows Hello";
  return "This device";
}

export function Passkeys({ keys }: { keys: Key[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [support, setSupport] = React.useState<"checking" | "yes" | "no">("checking");

  React.useEffect(() => {
    setName(guessDeviceName());
    if (!browserSupportsWebAuthn()) return setSupport("no");
    platformAuthenticatorIsAvailable().then((ok) => setSupport(ok ? "yes" : "no"));
  }, []);

  async function register() {
    setBusy(true);
    try {
      const opts = await passkeyRegisterOptionsAction();
      if (!opts.ok) throw new Error(opts.error);
      const resp = await startRegistration({ optionsJSON: opts.data });
      const r = await passkeyRegisterAction(JSON.stringify(resp), name);
      if (!r.ok) throw new Error(r.error);
      toast.success("Device registered. You can now clock in with fingerprint / Face ID.");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(/NotAllowedError|cancel/i.test(msg) ? "Cancelled" : /InvalidStateError|already/i.test(msg) ? "This device is already registered" : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bone text-ink">
              <Fingerprint className="size-5" />
            </div>
            <p className="text-sm text-slate-600">
              Your fingerprint or face never leaves your device. The phone checks it and sends Ugnayo a signed yes. Nothing biometric is stored on our servers.
            </p>
          </div>
          {support === "no" ? (
            <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">This browser or device has no fingerprint / face sensor available. Try your phone.</p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="devname" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Device name
                </label>
                <Input id="devname" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
              </div>
              <Button onClick={register} loading={busy} disabled={support !== "yes"}>
                <Fingerprint /> Register this device
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Registered devices" />
        {keys.length === 0 ? (
          <EmptyState title="No devices yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-3 px-5 py-3">
                <Smartphone className="size-5 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{k.name}</p>
                  <p className="text-xs text-slate-500">
                    Added {fmtDateTime(k.createdAt)} · {k.lastUsedAt ? `last used ${fmtDateTime(k.lastUsedAt)}` : "never used"}
                  </p>
                </div>
                <ConfirmButton action={passkeyDeleteAction.bind(null, k.id)} confirm={`Remove ${k.name}?`} variant="ghost" size="icon-sm" className="text-red-600">
                  <Trash2 />
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
