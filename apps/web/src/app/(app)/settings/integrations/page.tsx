import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@hris/db";
import { gate } from "@/server/auth/session";
import { providerConfig } from "@/server/auth/oidc";
import { appUrl } from "@/server/mail";
import { mailInfo } from "@/server/mail-info";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/card";
import { TestPushButton } from "./test-push";

export const metadata: Metadata = { title: "Integrations" };

const Env = ({ names }: { names: string[] }) => (
  <p className="flex flex-wrap gap-1.5">
    {names.map((n) => (
      <code key={n} className="rounded-md bg-canvas px-1.5 py-0.5 font-mono text-xs text-ink ring-1 ring-inset ring-hairline">
        {n}
      </code>
    ))}
  </p>
);

function Integration({ title, on, labels = ["Configured", "Not configured"], children }: { title: string; on: boolean; labels?: [string, string]; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} action={on ? <Badge tone="green">{labels[0]}</Badge> : <Badge tone="amber">{labels[1]}</Badge>} />
      <CardBody className="space-y-2.5 text-sm text-slate-600">{children}</CardBody>
    </Card>
  );
}

// Shows only presence of secrets, never their values.
export default async function IntegrationsPage() {
  await gate("ADMIN");
  const [devices, pushUsers] = await Promise.all([prisma.deviceToken.count(), prisma.deviceToken.groupBy({ by: ["userId"] }).then((g) => g.length)]);
  const tenant = process.env.MICROSOFT_TENANT_ID || "organizations";
  const domains = process.env.SSO_ALLOWED_DOMAINS?.trim();
  const mail = mailInfo();
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-muted">Integrations are switched on with server environment variables. Set them in your hosting provider, then redeploy.</p>
      <div className="grid gap-6 md:grid-cols-2">
        <Integration title="Google sign-in" on={!!providerConfig("google")}>
          <p>Lets people with an existing Ugnayo account sign in with the Google account that has the same email.</p>
          <Env names={["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]} />
          <p className="text-xs">
            Authorized redirect URI: <span className="break-all font-mono text-ink">{appUrl("/api/auth/google/callback")}</span>
          </p>
        </Integration>
        <Integration title="Microsoft sign-in" on={!!providerConfig("microsoft")}>
          <p>Microsoft Entra ID (work or school accounts). Pin the tenant to your company&apos;s directory ID.</p>
          <Env names={["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT_ID"]} />
          <p className="text-xs">
            Tenant: <span className="font-mono text-ink">{tenant}</span>
            {process.env.MICROSOFT_TENANT_ID ? null : " (default)"}
          </p>
          <p className="text-xs">
            Redirect URI: <span className="break-all font-mono text-ink">{appUrl("/api/auth/microsoft/callback")}</span>
          </p>
        </Integration>
        <Integration title="Email" on={mail.configured}>
          <p>Notification emails over SMTP{mail.host ? ` via ${mail.host}` : ""}.</p>
          <Env names={["SMTP_URL", "MAIL_FROM"]} />
          <Link href="/settings/email" className="inline-block text-sm font-medium text-brand-600 hover:underline">
            Email settings and test
          </Link>
        </Integration>
        <Integration title="Mobile push" on={devices > 0} labels={["Active", "No phones yet"]}>
          <p>
            {devices} {devices === 1 ? "phone" : "phones"} registered across {pushUsers} {pushUsers === 1 ? "person" : "people"}. Phones register when someone signs in on the
            mobile app.
          </p>
          <Env names={["EXPO_ACCESS_TOKEN (optional)"]} />
          <TestPushButton />
        </Integration>
        <Integration title="AI assistant" on={!!process.env.ANTHROPIC_API_KEY}>
          <p>Powers the AI features.</p>
          <Env names={["ANTHROPIC_API_KEY"]} />
        </Integration>
      </div>
      <p className="text-xs text-slate-500">
        Google and Microsoft sign-in never create accounts. They link to an active Ugnayo user with the same email
        {domains ? `, limited to ${domains} by ` : ", from any domain. Limit it with "}
        <code className="font-mono">SSO_ALLOWED_DOMAINS</code>.
      </p>
    </div>
  );
}
