import type { Metadata } from "next";
import { requireSession } from "@/server/auth/session";
import { listPasskeys } from "@/server/services/passkeys";
import { getEmailOptIn } from "@/server/services/settings";
import { getPushOptIn } from "@/server/push";
import { prisma } from "@hris/db";
import { PageHeader } from "@/components/ui/card";
import { Passkeys } from "./passkeys";
import { NotificationPrefs } from "./notifications";
import { SignInMethods } from "./sign-in-methods";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const user = await requireSession();
  const [keys, emailOptIn, pushOptIn, identities] = await Promise.all([
    listPasskeys(user.id),
    getEmailOptIn(user.id),
    getPushOptIn(user.id),
    prisma.userIdentity.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, provider: true, createdAt: true } }),
  ]);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Fingerprint & Face ID" description="Register this phone or laptop so you can clock in with its fingerprint or face scan." />
      <Passkeys keys={keys.map((k) => ({ ...k, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null }))} />
      <NotificationPrefs emailOptIn={emailOptIn} pushOptIn={pushOptIn} />
      <SignInMethods identities={identities} />
    </div>
  );
}
