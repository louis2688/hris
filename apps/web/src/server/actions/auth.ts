"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "../auth/oidc";
import bcrypt from "bcryptjs";
import { prisma } from "@hris/db";
import { changePasswordSchema, loginSchema } from "@hris/shared";
import { authenticate, clearSessionCookie, endAllSessions, getSession, hashPassword, requireSession, setSessionCookie } from "../auth/session";
import { audit } from "../services/audit";
import { clientIp, loginLimit, loginRefund, tooManyMessage } from "../rate-limit";
import { AppError } from "../services/errors";
import { formToObject, parse, run, type ActionResult } from "./_helpers";

export async function loginAction(_prev: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const p = parse(loginSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const ip = clientIp(await headers());
  const lim = await loginLimit(p.data.email, ip);
  if (!lim.ok) return { ok: false, error: tooManyMessage(lim.retryAfterSec) };
  const user = await authenticate(p.data.email, p.data.password);
  if (!user) return { ok: false, error: "Invalid email or password" };
  await loginRefund(p.data.email, ip);
  await setSessionCookie(user);
  await audit(user.id, "auth.login", "User", user.id);
  const next = String(fd.get("next") ?? "");
  redirect(safeNext(next));
}

/** Signs out every browser: a copied cookie dies with this one. The mobile app stays signed in. */
export async function logoutAction() {
  const s = await getSession();
  if (s) await endAllSessions(s.id, { mobile: false });
  await clearSessionCookie();
  redirect("/login");
}

export async function changePasswordAction(_prev: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const p = parse(changePasswordSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const s = await requireSession();
  return run(async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: s.id } });
    if (!(await bcrypt.compare(p.data.currentPassword, u.passwordHash))) throw new AppError("Current password is incorrect");
    await prisma.user.update({ where: { id: s.id }, data: { passwordHash: await hashPassword(p.data.newPassword) } });
    await endAllSessions(s.id);
    await setSessionCookie(s); // keep this browser signed in, every other one is out
    await audit(s.id, "auth.password_change", "User", s.id);
  }, "Password updated");
}

/** Remove a linked Google / Microsoft identity (own only). The next SSO sign-in with that email re-links it. */
export async function unlinkIdentityAction(id: string): Promise<ActionResult> {
  const s = await requireSession();
  return run(async () => {
    const idn = await prisma.userIdentity.findFirst({ where: { id, userId: s.id } });
    if (!idn) throw new AppError("That sign-in method is already disconnected");
    await prisma.userIdentity.delete({ where: { id } });
    await audit(s.id, "auth.sso_unlink", "UserIdentity", id, { before: { provider: idn.provider } });
    revalidatePath("/me/security");
  }, "Disconnected");
}
