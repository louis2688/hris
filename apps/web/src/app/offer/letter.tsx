import { EMPLOYMENT_TYPE_LABELS, type EmploymentType, type OfferTerm } from "@hris/shared";
import { fmtDate } from "@/lib/utils";

const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
export const peso = (n: number) => php.format(n);
const longDate = (d: Date | null | undefined) => (d ? fmtDate(d, "MMMM d, yyyy") : "-");
const manilaLong = (d: Date) => new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" }).format(d);

export type LetterCompany = { name: string; address: string; tin: string; signatoryName: string; signatoryTitle: string };
export type LetterOffer = {
  candidate: { firstName: string; lastName: string };
  jobTitle: { name: string } | null;
  department: { name: string } | null;
  employmentType: EmploymentType;
  payType: "MONTHLY" | "DAILY";
  basicPay: number;
  allowance: number;
  startDate: Date;
  expiresAt: Date | null;
  sentAt: Date | null;
  terms: OfferTerm[];
};

/** Letterhead used by the offer and appointment letters (screen + A4 print). */
export function Letterhead({ company }: { company: LetterCompany }) {
  return (
    <header className="border-b-2 border-ink pb-4 text-center">
      <p className="font-display text-2xl font-bold tracking-[-0.01em]">{company.name}</p>
      {company.address ? <p className="mt-1 text-sm text-slate-600">{company.address}</p> : null}
      {company.tin ? <p className="text-xs text-slate-500">TIN {company.tin}</p> : null}
    </header>
  );
}

export function Signature({ company, label }: { company: LetterCompany; label?: string }) {
  return (
    <div className="w-60 max-w-full">
      {label ? <p className="mb-10 text-sm">{label}</p> : null}
      <div className="border-b border-ink" />
      <p className="mt-2 font-semibold">{company.signatoryName || "Authorized Signatory"}</p>
      <p className="text-sm text-slate-600">{company.signatoryTitle}</p>
    </div>
  );
}

export function CompTable({ o }: { o: Pick<LetterOffer, "payType" | "basicPay" | "allowance" | "jobTitle" | "department" | "employmentType" | "startDate" | "terms"> }) {
  const rows: [string, React.ReactNode][] = [
    ["Position", o.jobTitle?.name ?? "-"],
    ...(o.department ? ([["Department", o.department.name]] as [string, string][]) : []),
    ["Employment type", EMPLOYMENT_TYPE_LABELS[o.employmentType]],
    ["Start date", longDate(o.startDate)],
    [o.payType === "DAILY" ? "Daily rate" : "Monthly basic salary", <strong key="b">{peso(o.basicPay)}</strong>],
    ...(o.allowance > 0 ? ([["Monthly allowance (de minimis)", peso(o.allowance)]] as [string, string][]) : []),
    ...o.terms.map((t) => [t.label, t.value] as [string, string]),
  ];
  return (
    <table className="w-full border-collapse text-[14px]">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-hairline align-top">
            <th scope="row" className="w-[42%] py-2.5 pr-4 text-left font-medium text-slate-600">
              {k}
            </th>
            <td className="py-2.5 text-ink">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Body of the offer letter; the public page and the printable HR copy both render this. */
export function OfferLetter({ company, o, children }: { company: LetterCompany; o: LetterOffer; children?: React.ReactNode }) {
  const role = o.jobTitle?.name ?? "the position we discussed";
  return (
    <div className="font-serif text-[15px] leading-relaxed text-ink">
      <Letterhead company={company} />
      <p className="mt-8 text-sm">{manilaLong(o.sentAt ?? new Date())}</p>
      <p className="mt-6 font-semibold">
        {o.candidate.firstName} {o.candidate.lastName}
      </p>
      <h1 className="mt-8 font-display text-2xl font-bold tracking-[-0.01em]">Offer of employment</h1>
      <div className="mt-5 space-y-4">
        <p>Dear {o.candidate.firstName},</p>
        <p>
          We are pleased to offer you the position of <strong>{role}</strong>
          {o.department ? <> in our {o.department.name} department</> : null} at <strong>{company.name}</strong>, starting <strong>{longDate(o.startDate)}</strong>. The details of this offer are below.
        </p>
      </div>
      <div className="mt-6">
        <CompTable o={o} />
      </div>
      <div className="mt-6 space-y-4">
        <p>Compensation is subject to the applicable withholding tax and mandatory SSS, PhilHealth and Pag-IBIG contributions.</p>
        {o.expiresAt ? (
          <p>
            This offer is valid until <strong>{longDate(o.expiresAt)}</strong>.
          </p>
        ) : null}
        <p>We look forward to having you on the team.</p>
      </div>
      <div className="mt-12">
        <Signature company={company} label="Sincerely," />
      </div>
      {children}
    </div>
  );
}
