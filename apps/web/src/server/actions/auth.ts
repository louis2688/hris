"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@hris/db";
import { changePasswordSchema, loginSchema } from "@hris/shared";
import { authenticate, clearSessionCookie, hashPassword, requireSession, setSessionCookie } from "../auth/session";
import { audit } from "../services/audit";
import { AppError } from "../services/errors";
import { formToObject, parse, run, type ActionResult } from "./_helpers";

export async function loginAction(_prev: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const p = parse(loginSchema, formToObject(fd));
  if ("error" in p) return p.error;
  const user = await authenticate(p.data.email, p.data.password);
  if (!user) return { ok: false, error: "Invalid email or password" };
  await setSessionCookie(user);
  await audit(user.id, "auth.login", "User", user.id);
  const next = String(fd.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logoutAction() {
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
    await prisma.refreshToken.updateMany({ where: { userId: s.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(s.id, "auth.password_change", "User", s.id);
  }, "Password updated");
}
