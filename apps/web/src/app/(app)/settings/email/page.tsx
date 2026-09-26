import type { Metadata } from "next";
import { gate } from "@/server/auth/session";
import { mailInfo } from "@/server/mail-info";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/card";
import { TestEmailButton } from "./test-email";

export const metadata: Metadata = { title: "Email settings" };

export default async function EmailSettingsPage() {
  const user = await gate("ADMIN");
  const m = mailInfo();
  const rows: [string, React.ReactNode][] = [
    ["SMTP", m.configured ? <Badge tone="green">Configured</Badge> : <Badge tone="amber">Not configured</Badge>],
    ["SMTP host", m.host ?? "-"],
    ["From address", <>{m.from}{m.fromIsDefault ? <span className="ml-2 text-xs text-slate-500">(default, set MAIL_FROM)</span> : null}</>],
    ["App URL in emails", <>{m.appUrl}<span className="ml-2 text-xs text-slate-500">(from {m.appUrlSource})</span></>],
  ];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Email delivery" description="Notification emails go out over SMTP. Set SMTP_URL and MAIL_FROM in the server environment." />
        <CardBody>
          <dl className="divide-y divide-slate-100 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="grid gap-1 py-2.5 sm:grid-cols-[180px_1fr]">
                <dt className="font-medium text-slate-500">{k}</dt>
                <dd className="break-all text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
          {!m.configured ? <p className="mt-3 text-xs text-slate-500">Without SMTP, users still get in-app notifications; emails are skipped.</p> : null}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Send a test email" description={`Sends a test message to ${user.email}.`} />
        <CardBody>
          <TestEmailButton />
        </CardBody>
      </Card>
    </div>
  );
}
