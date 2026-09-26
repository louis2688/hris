import type { Metadata } from "next";
import { requireSession } from "@/server/auth/session";
import { listPasskeys } from "@/server/services/passkeys";
import { PageHeader } from "@/components/ui/card";
import { Passkeys } from "./passkeys";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const user = await requireSession();
  const keys = await listPasskeys(user.id);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Fingerprint & Face ID" description="Register this phone or laptop so you can clock in with its fingerprint or face scan." />
      <Passkeys keys={keys.map((k) => ({ ...k, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null }))} />
    </div>
  );
}
