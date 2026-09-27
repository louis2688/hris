import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@hris/db";
import { EMPLOYMENT_TYPE_LABELS } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { getOffer, termsOf } from "@/server/services/offers";
import { getSetting } from "@/server/services/settings";
import { fmtDate } from "@/lib/utils";
import { CompTable, Letterhead, Signature } from "@/app/offer/letter";
import { PrintPage } from "../print-page";

export const metadata: Metadata = { title: "Appointment letter" };

export default async function AppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  await gate("ADMIN", "HR");
  const { id } = await params;
  const o = await getOffer(id).catch(() => null);
  if (!o || o.status !== "ACCEPTED" || !o.candidate.hiredEmployeeId) notFound();
  const [company, e] = await Promise.all([
    getSetting("company"),
    prisma.employee.findUnique({
      where: { id: o.candidate.hiredEmployeeId },
      select: { employeeCode: true, firstName: true, middleName: true, lastName: true, hireDate: true, employmentType: true, jobTitle: { select: { name: true } }, department: { select: { name: true } } },
    }),
  ]);
  if (!e) notFound();
  const name = [e.firstName, e.middleName ? `${e.middleName[0]}.` : null, e.lastName].filter(Boolean).join(" ");
  const position = e.jobTitle?.name ?? o.jobTitle?.name ?? "-";
  const probation = termsOf(o).find((t) => /probation/i.test(t.label))?.value ?? "six (6) months";

  return (
    <PrintPage back={`/recruitment/candidates/${o.candidateId}`}>
      <div className="font-serif text-[15px] leading-relaxed text-ink">
        <Letterhead company={company} />
        <div className="mt-8 flex items-start justify-between gap-4 text-sm">
          <p>Employee ID {e.employeeCode}</p>
          <p>{new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" }).format(new Date())}</p>
        </div>
        <p className="mt-6 font-semibold">{name.toUpperCase()}</p>
        <h1 className="mt-8 text-center font-display text-2xl font-bold tracking-[0.12em]">NOTICE OF APPOINTMENT</h1>
        <div className="mt-8 space-y-4 sm:text-justify">
          <p>Dear {e.firstName},</p>
          <p>
            We are pleased to confirm your appointment as <strong>{position}</strong>
            {e.department ? <> in the {e.department.name} department</> : null} of <strong>{company.name}</strong> on a <strong>probationary</strong> status, effective <strong>{fmtDate(e.hireDate, "MMMM d, yyyy")}</strong>.
          </p>
          <p>
            Your probationary period is {probation}. You will be evaluated against the standards made known to you at the start of your employment; upon meeting them you will be regularized in accordance with Article 296 of the Labor Code of the Philippines. Your employment type is{" "}
            {EMPLOYMENT_TYPE_LABELS[e.employmentType].toLowerCase()}.
          </p>
          <p>Your compensation and terms are as follows:</p>
        </div>
        <div className="mt-4">
          <CompTable o={{ ...o, jobTitle: { name: position }, department: e.department ?? o.department, startDate: e.hireDate, basicPay: Number(o.basicPay), allowance: Number(o.allowance), terms: termsOf(o).filter((t) => !/probation/i.test(t.label)) }} />
        </div>
        <p className="mt-6">Welcome to {company.name}.</p>
        <div className="mt-12">
          <Signature company={company} label="Very truly yours," />
        </div>
        <div className="mt-12 border-t border-hairline pt-6 text-sm">
          <p className="font-semibold">Conforme</p>
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <div>
              <div className="border-b border-ink" />
              <p className="mt-1.5">{name}</p>
            </div>
            <div>
              <div className="border-b border-ink" />
              <p className="mt-1.5">Date</p>
            </div>
          </div>
        </div>
      </div>
    </PrintPage>
  );
}
