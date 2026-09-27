import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { gate } from "@/server/auth/session";
import { getOffer, termsOf } from "@/server/services/offers";
import { getSetting } from "@/server/services/settings";
import { fmtDate } from "@/lib/utils";
import { OfferLetter } from "@/app/offer/letter";
import { PrintPage } from "../print-page";

export const metadata: Metadata = { title: "Offer letter" };

export default async function OfferLetterPage({ params }: { params: Promise<{ id: string }> }) {
  await gate("ADMIN", "HR");
  const { id } = await params;
  const o = await getOffer(id).catch(() => null);
  if (!o) notFound();
  const company = await getSetting("company");
  return (
    <PrintPage back={`/recruitment/candidates/${o.candidateId}`}>
      <OfferLetter company={company} o={{ ...o, basicPay: Number(o.basicPay), allowance: Number(o.allowance), terms: termsOf(o) }}>
        <div className="mt-12 border-t border-hairline pt-6">
          <p className="text-sm font-semibold">Conforme</p>
          {o.status === "ACCEPTED" ? (
            <p className="mt-2 text-sm">
              Accepted electronically by <strong className="font-serif">{o.signatureName}</strong> on {fmtDate(o.respondedAt)}.
            </p>
          ) : (
            <div className="mt-10 grid gap-8 text-sm sm:grid-cols-2">
              <div>
                <div className="border-b border-ink" />
                <p className="mt-1.5">
                  {o.candidate.firstName} {o.candidate.lastName}
                </p>
              </div>
              <div>
                <div className="border-b border-ink" />
                <p className="mt-1.5">Date</p>
              </div>
            </div>
          )}
        </div>
      </OfferLetter>
    </PrintPage>
  );
}
