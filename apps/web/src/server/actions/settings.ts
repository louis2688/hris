"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@hris/db";
import { requireRole, requireSession } from "../auth/session";
import { renderEmail, sendMail } from "../mail";
import { setEmailOptIn } from "../services/settings";
import { sendPush, setPushOptIn } from "../push";
import { AppError } from "../services/errors";
import { formToObject, run, type ActionResult } from "./_helpers";

export async function saveNotificationPrefsAction(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const u = await requireSession();
  const f = formToObject(fd);
  const r = await run(() => Promise.all([setEmailOptIn(u.id, f.emailOptIn === "on"), setPushOptIn(u.id, f.pushOptIn === "on")]).then(() => {}), "Notification preferences saved");
  revalidatePath("/me/security");
  return r;
}

export async function sendTestEmailAction(_p?: ActionResult, _fd?: FormData): Promise<ActionResult> {
  const u = await requireRole("ADMIN");
  if (!process.env.SMTP_URL) return { ok: false, error: "SMTP is not configured. Set SMTP_URL first." };
  return run(async () => {
    const sent = await sendMail({ to: u.email, subject: "Ugnayo test email", ...renderEmail("Ugnayo test email", "SMTP is configured correctly.", "/") });
    if (!sent) throw new AppError("Sending failed. Check the server logs for the SMTP error.");
  }, `Test email sent to ${u.email}`);
}

export async function sendTestPushAction(_p?: ActionResult, _fd?: FormData): Promise<ActionResult> {
  const u = await requireRole("ADMIN");
  if (!(await prisma.deviceToken.count({ where: { userId: u.id } }))) return { ok: false, error: "No phone registered for your account. Sign in on the mobile app first." };
  return run(async () => {
    const n = await sendPush(u.id, { title: "Ugnayo test notification", body: "Push notifications are working.", data: { link: "/dashboard" } });
    if (!n) throw new AppError("Expo did not accept the push. Check the server logs.");
  }, "Test push sent to your phone");
}
