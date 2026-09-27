import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NTE_MIN_DAYS } from "@hris/shared";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { getLetter } from "@/server/services/cases";
import { getSetting } from "@/server/services/settings";
import { PrintButton } from "@/components/print-button";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Case notice" };

const long = new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" });
const longTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Manila" });

/** Printable twin notices: the Notice to Explain and the Notice of Decision. HR, or the employee once served. */
export default async function CaseLetterPage({ params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  if (kind !== "nte" && kind !== "decision") notFound();
  const user = await requireSession();
  const c = await getLetter(user, id, kind).catch(() => notFound());
  const company = await getSetting("company");
  const e = c.employee;
  const name = [e.firstName, e.middleName ? `${e.middleName[0]}.` : null, e.lastName].filter(Boolean).join(" ");
  const honorific = e.gender === "MALE" ? "Mr." : e.gender === "FEMALE" ? "Ms." : "";
  const dear = honorific ? `${honorific} ${e.lastName}` : name;
  const nte = kind === "nte";
  const date = (nte ? c.nteIssuedAt : c.decidedAt) ?? new Date();
  const ref = `${nte ? "NTE" : "NOD"}-${c.id.slice(-6).toUpperCase()}`;

  return (
    <div>
      <style>{`@page { size: A4; margin: 18mm 20mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={isStaff(user) ? `/cases/${c.id}` : "/me?tab=cases"} className={buttonVariants({ variant: "ghost" })}>
          <ArrowLeft /> Back
        </Link>
        <PrintButton label="Print / Save as PDF" />
      </div>

      <article className="mx-auto flex w-full max-w-[210mm] flex-col bg-card px-6 py-8 font-serif text-[15px] leading-relaxed text-ink shadow-float sm:min-h-[297mm] sm:px-[20mm] sm:py-[18mm] print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="border-b-2 border-ink pb-4 text-center">
          <p className="font-display text-2xl font-bold tracking-[-0.01em]">{company.name}</p>
          {company.address ? <p className="mt-1 text-sm text-slate-600">{company.address}</p> : null}
        </header>

        <div className="mt-8 flex items-start justify-between gap-4 text-sm">
          <p>Ref. No. {ref}</p>
          <p>{long.format(date)}</p>
        </div>

        <div className="mt-8 text-sm">
          <p className="font-semibold">{[honorific, name.toUpperCase()].filter(Boolean).join(" ")}</p>
          {e.jobTitle ? <p>{e.jobTitle.name}</p> : null}
          {e.department ? <p>{e.department.name}</p> : null}
          <p>Employee ID {e.employeeCode}</p>
        </div>

        <h1 className="mt-8 font-display text-xl font-bold tracking-[0.08em]">{nte ? "NOTICE TO EXPLAIN" : "NOTICE OF DECISION"}</h1>
        <p className="mt-1 text-sm">Re: {c.title}</p>

        <div className="mt-6 space-y-4 sm:text-justify">
          <p>Dear {dear}:</p>
          {nte ? (
            <>
              <p>This is to inform you of the following acts or omissions attributed to you, which, if proven, may constitute a violation of company rules:</p>
              <p className="whitespace-pre-wrap border-l-2 border-hairline pl-4">{c.nteText}</p>
              <p>
                You are directed to submit a written explanation on or before <strong>{c.nteDueAt ? longTime.format(c.nteDueAt) : ""}</strong>, a period of not less than {NTE_MIN_DAYS} calendar days from receipt of this notice,
                stating why no disciplinary action should be taken against you. You may submit it through Ugnayo (My Info, Cases) or in writing to HR.
              </p>
              <p>You may request a hearing or conference, where you may be assisted by a representative or counsel of your choice. If you do not submit an explanation by the deadline, the company will decide on the basis of the evidence on hand.</p>
            </>
          ) : (
            <>
              <p>
                This refers to the Notice to Explain served on you on {c.nteIssuedAt ? long.format(c.nteIssuedAt) : ""}.{" "}
                {c.explanation ? "After considering your written explanation" : "You did not submit a written explanation within the period given. After evaluating the evidence on hand"}
                {c.hearingAt ? ` and the hearing held on ${long.format(c.hearingAt)}` : ""}, the company finds as follows:
              </p>
              <p className="whitespace-pre-wrap border-l-2 border-hairline pl-4">{c.decision}</p>
              <p>
                Sanction: <strong>{c.sanction}</strong>
              </p>
              <p>This decision takes effect upon your receipt of this notice.</p>
            </>
          )}
        </div>

        <div className="mt-16 w-64">
          <div className="border-b border-ink" />
          <p className="mt-2 font-semibold">{company.signatoryName || "Authorized Signatory"}</p>
          <p className="text-sm text-slate-600">{company.signatoryTitle}</p>
        </div>

        <div className="mt-12 w-64 text-sm">
          <p>Received by:</p>
          <div className="mt-10 border-b border-ink" />
          <p className="mt-2">{name}, date</p>
        </div>
      </article>
    </div>
  );
}
