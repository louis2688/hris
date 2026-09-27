"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions/_helpers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type Decide = (prev: ActionResult | undefined, fd: FormData) => Promise<ActionResult>;

/** Reject / Approve pair for list rows. `action` is a (prev, fd) server action already bound to the row id. */
export function DecideButtons({ action, approveLabel = "Approve", name }: { action: Decide; approveLabel?: string; name?: string }) {
  const [pending, start] = React.useTransition();
  const [which, setWhich] = React.useState<string>();
  const go = (decision: "APPROVED" | "REJECTED") =>
    start(async () => {
      setWhich(decision);
      const fd = new FormData();
      fd.set("decision", decision);
      const r = await action(undefined, fd);
      if (r.ok) toast.success(r.message ?? "Done");
      else toast.error(r.error);
    });
  return (
    <div className="flex shrink-0 gap-2">
      <Button size="sm" variant="ghost" loading={pending && which === "REJECTED"} disabled={pending} onClick={() => go("REJECTED")} aria-label={name ? `Reject ${name}` : undefined}>
        Reject
      </Button>
      <Button size="sm" loading={pending && which === "APPROVED"} disabled={pending} onClick={() => go("APPROVED")} aria-label={name ? `${approveLabel} ${name}` : undefined}>
        {approveLabel}
      </Button>
    </div>
  );
}

/** Small button that runs a no-arg action (withdraw, cancel) with a toast. */
export function ActButton({ action, children, variant = "ghost" }: { action: () => Promise<ActionResult<unknown>>; children: React.ReactNode; variant?: "ghost" | "secondary" }) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      variant={variant}
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await action();
          if (r.ok) toast.success(r.message ?? "Done");
          else toast.error(r.error);
        })
      }
    >
      {children}
    </Button>
  );
}

/**
 * Button + dialog that also opens when `?{param}` is in the URL (links from /requests and the DTR).
 * The form inside gets `close` to call on success.
 */
export function ParamDialog({
  param,
  label,
  title,
  description,
  variant = "secondary",
  size,
  icon,
  children,
}: {
  param: string;
  label: string;
  title: string;
  description?: string;
  variant?: "default" | "secondary" | "ghost";
  size?: "sm" | "default";
  icon?: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = React.useState(params.get(param) === "1");
  const close = () => {
    setOpen(false);
    if (params.get(param)) router.replace(window.location.pathname);
  };
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {icon}
        {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent title={title} description={description}>
          {children(close)}
        </DialogContent>
      </Dialog>
    </>
  );
}
