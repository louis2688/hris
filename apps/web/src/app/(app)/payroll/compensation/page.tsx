import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { gate } from "@/server/auth/session";
import { listCompensation, today } from "@/server/services/payroll";
import { PageHeader } from "@/components/ui/card";
import { fullName } from "@/lib/utils";
import { CompensationTable } from "./table";

export const metadata: Metadata = { title: "Compensation" };

export default async function CompensationPage() {
  await gate("ADMIN", "HR");
  const rows = await listCompensation();
  const missing = rows.filter((r) => r.basicPay == null).length;
  return (
    <>
      <Link href="/payroll" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-ink">
        <ArrowLeft className="size-4" /> Payroll runs
      </Link>
      <PageHeader title="Compensation" description={missing ? `${missing} employee${missing > 1 ? "s have" : " has"} no basic pay and will be skipped by payroll` : "Pay basis and government numbers used by payroll"} />
      <CompensationTable
        today={today()}
        rows={rows.map((r) => ({
          id: r.id,
          name: fullName(r),
          code: r.employeeCode,
          department: r.department?.name ?? null,
          payType: r.payType,
          basicPay: r.basicPay == null ? null : Number(r.basicPay),
          allowance: Number(r.allowance),
          tin: r.tin,
          sssNo: r.sssNo,
          philhealthNo: r.philhealthNo,
          pagibigNo: r.pagibigNo,
          bankName: r.bankName,
          bankAccountNo: r.bankAccountNo,
          upcoming: r.upcoming,
        }))}
      />
    </>
  );
}
