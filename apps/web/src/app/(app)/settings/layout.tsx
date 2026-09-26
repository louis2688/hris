import { gate } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { SettingsNav } from "./nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await gate("ADMIN", "HR");
  return (
    <>
      <PageHeader title="Settings" description="Organisation structure and leave policy" />
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <SettingsNav isAdmin={user.role === "ADMIN"} />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
