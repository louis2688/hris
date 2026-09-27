import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EMPLOYMENT_TYPE_LABELS } from "@hris/shared";
import { requireSession } from "@/server/auth/session";
import { isStaff } from "@/server/authz";
import { getCertificate } from "@/server/services/requests";
import { getSetting } from "@/server/services/settings";
import { PrintButton } from "@/components/print-button";
import { buttonVariants } from "@/components/ui/button";
import { fmtDate } from "@/lib/utils";
import { peso, shortRef } from "../../../_ui/shared";

export const metadata: Metadata = { title: "Certificate of employment" };

const manilaLong = new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" });
const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");
/** "27th day of September 2026" in Manila time. */
function issuedPhrase(d: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Manila" }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${ordinal(Number(parts.day))} day of ${parts.month} ${parts.year}`;
}
/** "Bank loan" -> "bank loan", but keep acronyms like "SSS". */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession();
  const [c, company] = await Promise.all([getCertificate(id).catch(() => null), getSetting("company")]);
  // Only the employee and HR/Admin; 404 rather than 403 so ids don't leak.
  if (!c || c.status !== "APPROVED" || !(c.employeeId === user.employeeId || isStaff(user))) notFound();
  const e = c.employee;
  const name = [e.firstName, e.middleName ? `${e.middleName[0]}.` : null, e.lastName].filter(Boolean).join(" ");
  const honorific = e.gender === "MALE" ? "Mr." : e.gender === "FEMALE" ? "Ms." : "";
  const pronoun = e.gender === "MALE" ? "His" : e.gender === "FEMALE" ? "Her" : "Their";
  const ended = e.terminationDate && e.terminationDate <= new Date();
  const issued = c.decidedAt ?? c.createdAt;
  const ref = `COE-${shortRef(c.id)}`;
  const allowance = Number(e.allowance);

  return (
    <div>
      <style>{`@page { size: A4; margin: 18mm 20mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/requests/coe/${c.id}`} className={buttonVariants({ variant: "ghost" })}>
          <ArrowLeft /> Back to request
        </Link>
        <PrintButton label="Print / Save as PDF" />
      </div>

      <article className="mx-auto flex w-full sm:min-h-[297mm] max-w-[210mm] flex-col bg-card px-6 py-8 font-serif text-[15px] leading-relaxed text-ink shadow-float sm:px-[20mm] sm:py-[18mm] print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="border-b-2 border-ink pb-4 text-center">
          <p className="font-display text-2xl font-bold tracking-[-0.01em]">{company.name}</p>
          {company.address ? <p className="mt-1 text-sm text-slate-600">{company.address}</p> : null}
          {company.tin ? <p className="text-xs text-slate-500">TIN {company.tin}</p> : null}
        </header>

        <div className="mt-8 flex items-start justify-between gap-4 text-sm">
          <p>Ref. No. {ref}</p>
          <p>{manilaLong.format(issued)}</p>
        </div>

        <h1 className="mt-10 text-center font-display text-2xl font-bold tracking-[0.12em]">CERTIFICATE OF EMPLOYMENT</h1>

        <div className="mt-10 space-y-5 sm:text-justify">
          <p>To whom it may concern:</p>
          <p>
            This is to certify that <strong>{[honorific, name.toUpperCase()].filter(Boolean).join(" ")}</strong> {ended ? "was" : "has been"} employed by <strong>{company.name}</strong>
            {e.jobTitle ? (
              <>
                {" "}as <strong>{e.jobTitle.name}</strong>
              </>
            ) : null}
            {e.department ? <> in the {e.department.name} department</> : null} from <strong>{fmtDate(e.hireDate, "MMMM d, yyyy")}</strong> {ended ? <>to <strong>{fmtDate(e.terminationDate, "MMMM d, yyyy")}</strong></> : "up to the present"}, on a{" "}
            {EMPLOYMENT_TYPE_LABELS[e.employmentType].toLowerCase()} basis.
          </p>
          {c.includeCompensation && e.basicPay != null ? (
            <p>
              {pronoun} {ended ? "last" : "current"} compensation is a {e.payType === "DAILY" ? "daily rate" : "monthly basic salary"} of <strong>{peso(e.basicPay)}</strong>
              {allowance > 0 ? (
                <>
                  {" "}plus a monthly allowance of <strong>{peso(allowance)}</strong>
                </>
              ) : null}
              .
            </p>
          ) : null}
          <p>
            This certification is issued upon the request of {honorific ? `${honorific} ${e.lastName}` : name} for {lowerFirst(c.purpose)} purposes and for whatever legal purpose it may serve.
          </p>
          <p>Issued this {issuedPhrase(issued)}.</p>
        </div>

        <div className="mt-20 w-64">
          <div className="border-b border-ink" />
          <p className="mt-2 font-semibold">{company.signatoryName || "Authorized Signatory"}</p>
          <p className="text-sm text-slate-600">{company.signatoryTitle}</p>
        </div>

        <footer className="mt-12 border-t border-hairline sm:mt-auto print:mt-16 pt-4 text-xs text-slate-500">
          Reference {ref}. Not valid without an authorized signature. Verify with {company.name} HR.
        </footer>
      </article>
    </div>
  );
}
