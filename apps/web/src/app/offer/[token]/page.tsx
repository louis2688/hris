import type { Metadata } from "next";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { getPublicOffer } from "@/server/services/offers";
import { getSetting } from "@/server/services/settings";
import { fmtDate } from "@/lib/utils";
import { PublicShell } from "../../careers/public-shell";
import { OfferLetter } from "../letter";
import { Respond } from "./respond";

// The token is the credential: keep it out of search engines and Referer headers.
export const metadata: Metadata = { title: "Your job offer", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function OfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [o, company] = await Promise.all([getPublicOffer(token), getSetting("company")]);

  return (
    <PublicShell company={company.name}>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {!o ? (
          <State icon={<XCircle />} tone="red" title="Offer not found">
            This link is invalid or no longer active. If you think this is a mistake, reply to the email you received from {company.name} HR.
          </State>
        ) : (
          <>
            {o.status === "ACCEPTED" ? (
              <State icon={<CheckCircle2 />} tone="green" title="You accepted this offer">
                Signed as {o.signatureName} on {fmtDate(o.respondedAt)}. {company.name} HR will contact you about your first day.
              </State>
            ) : o.status === "DECLINED" ? (
              <State icon={<XCircle />} tone="slate" title="You declined this offer">
                Thank you for letting us know. We wish you the best.
              </State>
            ) : o.status === "WITHDRAWN" ? (
              <State icon={<XCircle />} tone="slate" title="This offer was withdrawn">
                Please contact {company.name} HR if you have questions.
              </State>
            ) : o.status === "EXPIRED" ? (
              <State icon={<Clock />} tone="amber" title="This offer has expired">
                It was valid until {fmtDate(o.expiresAt)}. Please contact {company.name} HR if you are still interested.
              </State>
            ) : null}
            <article className="mt-6 rounded-2xl bg-card px-5 py-8 ring-1 ring-hairline sm:px-12 sm:py-12">
              <OfferLetter company={company} o={o} />
            </article>
            {o.status === "SENT" ? <Respond token={token} fullName={`${o.candidate.firstName} ${o.candidate.lastName}`} /> : null}
          </>
        )}
      </div>
    </PublicShell>
  );
}

function State({ icon, tone, title, children }: { icon: React.ReactNode; tone: "green" | "red" | "amber" | "slate"; title: string; children: React.ReactNode }) {
  const bg = { green: "bg-tone-green-bg text-tone-green-fg", red: "bg-tone-red-bg text-tone-red-fg", amber: "bg-tone-amber-bg text-tone-amber-fg", slate: "bg-bone text-ink" }[tone];
  return (
    <div className={`flex items-start gap-3 rounded-2xl p-5 ${bg}`} role="status">
      <span className="mt-0.5 [&_svg]:size-5">{icon}</span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm opacity-90">{children}</p>
      </div>
    </div>
  );
}
