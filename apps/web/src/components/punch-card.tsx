"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { Camera, Fingerprint, LogIn, LogOut, MapPin } from "lucide-react";
import { toast } from "sonner";
import { punchAction, punchOptionsAction } from "@/server/actions/attendance";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Policy = { requirePasskey: boolean; requirePhoto: boolean; requireLocation: boolean; requireGeofence?: boolean };

/** Downscale a camera photo to a ~320px JPEG data URL (keeps DB rows small). */
async function toSmallJpeg(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

const position = () =>
  new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10_000 }));

export function PunchCard({ clockedIn, since, shiftLabel, timeZone, policy, hasPasskey }: { clockedIn: boolean; since: string | null; shiftLabel: string; timeZone: string; policy: Policy; hasPasskey: boolean }) {
  const router = useRouter();
  const [now, setNow] = React.useState<Date | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const pendingPhoto = React.useRef<((v: string | null) => void) | null>(null);

  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-PH", { timeZone, ...opts }).format(d);
  const usePasskey = policy.requirePasskey || hasPasskey;

  const askPhoto = () =>
    new Promise<string | null>((resolve) => {
      pendingPhoto.current = resolve;
      fileRef.current!.value = "";
      fileRef.current!.click();
    });

  async function punch() {
    setBusy(true);
    try {
      let assertion: string | undefined;
      if (usePasskey) {
        const opts = await punchOptionsAction();
        if (!opts.ok) throw new Error(opts.error);
        assertion = JSON.stringify(await startAuthentication({ optionsJSON: opts.data }));
      }
      let photo: string | undefined;
      if (policy.requirePhoto) {
        const p = await askPhoto();
        if (!p) throw new Error("A selfie is required to punch");
        photo = p;
      }
      let latitude: number | undefined;
      let longitude: number | undefined;
      let accuracy: number | undefined;
      if (policy.requireLocation || policy.requireGeofence) {
        const pos = await position().catch(() => {
          throw new Error("Allow location access to punch");
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        accuracy = pos.coords.accuracy;
      }
      const r = await punchAction({ assertion, photo, latitude, longitude, accuracy });
      if (!r.ok) throw new Error(r.error);
      toast.success(`${r.message} at ${fmt(new Date(r.data.at), { hour: "2-digit", minute: "2-digit" })}`);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(40);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(/NotAllowedError|cancel/i.test(msg) ? "Verification cancelled" : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className={cn("p-6 text-on-dark", clockedIn ? "bg-ink" : "hero-mesh")}>
        <p className="text-sm/5 opacity-85">{now ? fmt(now, { weekday: "long", month: "long", day: "numeric" }) : " "}</p>
        <p className="mt-1 font-display text-6xl font-bold leading-none tracking-[-0.03em] tabular-nums" suppressHydrationWarning>
          {now ? fmt(now, { hour: "2-digit", minute: "2-digit" }) : "--:--"}
        </p>
        <p className="mt-2 text-sm opacity-90">
          {clockedIn && since ? `Clocked in since ${fmt(new Date(since), { hour: "2-digit", minute: "2-digit" })}` : "Not clocked in"} · {shiftLabel}
        </p>
      </div>
      <div className="flex flex-col gap-3 p-5">
        <Button size="lg" variant="brand" className="h-14 w-full text-base" onClick={punch} loading={busy}>
          {clockedIn ? <LogOut /> : <LogIn />}
          {clockedIn ? "Clock out" : "Clock in"}
        </Button>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {usePasskey ? (
            <span className="inline-flex items-center gap-1">
              <Fingerprint className="size-3.5" /> Fingerprint / Face ID
            </span>
          ) : null}
          {policy.requirePhoto ? (
            <span className="inline-flex items-center gap-1">
              <Camera className="size-3.5" /> Selfie required
            </span>
          ) : null}
          {policy.requireLocation || policy.requireGeofence ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {policy.requireGeofence ? "Must be at the office" : "Location recorded"}
            </span>
          ) : null}
          {!usePasskey && policy.requirePasskey === false ? (
            <a href="/me/security" className="text-ink underline underline-offset-2 hover:text-slate-600">
              Set up fingerprint / Face ID
            </a>
          ) : null}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          pendingPhoto.current?.(f ? await toSmallJpeg(f) : null);
          pendingPhoto.current = null;
        }}
      />
    </Card>
  );
}
