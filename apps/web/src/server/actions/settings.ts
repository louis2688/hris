"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "../auth/session";
import { renderEmail, sendMail } from "../mail";
import { setEmailOptIn } from "../services/settings";
import { AppError } from "../services/errors";
import { formToObject, run, type ActionResult } from "./_helpers";

export async function saveEmailPrefAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const on = formToObject(fd).emailOptIn === "on";
  const r = await run(() => setEmailOptIn(u.id, on), on ? "Email notifications on" : "Email notifications off");
  revalidatePath("/me/security");
  return r;
}

export async function sendTestEmailAction(_p?: ActionResult, _fd?: FormData): Promise<ActionResult> {
  const u = await requireRole("ADMIN");
  if (!process.env.SMTP_URL) return { ok: false, error: "SMTP is not configured. Set SMTP_URL first." };
  return run(async () => {
    const sent = await sendMail({ to: u.email, subject: "HRIS test email", ...renderEmail("HRIS test email", "SMTP is configured correctly.", "/") });
    if (!sent) throw new AppError("Sending failed. Check the server logs for the SMTP error.");
  }, `Test email sent to ${u.email}`);
}
