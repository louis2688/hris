import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@hris/db";
import { listLeaveTypes } from "@/server/services/leave";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fullName } from "@/lib/utils";
import { BulkEntitlementForm } from "./bulk-form";

export const metadata: Metadata = { title: "Entitlements" };

export default async function EntitlementsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: y } = await searchParams;
  const year = Number(y) || new Date().getUTCFullYear();
  const [types, employees] = await Promise.all([
    listLeaveTypes(true),
    prisma.employee.findMany({
      where: { deletedAt: null, employmentStatus: { notIn: ["TERMINATED", "RESIGNED"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, preferredName: true, employeeCode: true, leaveEntitlements: { where: { year }, select: { leaveTypeId: true, entitledDays: true, carriedOver: true, adjustment: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={`Bulk assign ${year}`} description="Grant a leave type to every active employee at once. Per-person tweaks live on the employee's Leave tab." />
        <CardBody>
          <BulkEntitlementForm year={year} types={types.map((t) => ({ id: t.id, name: t.name, defaultDays: Number(t.defaultDays) }))} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title={`Entitlements ${year}`}
          description="Entitled + carried over + adjustment"
          action={
            <div className="flex gap-2 text-sm">
              <Link href={`/settings/entitlements?year=${year - 1}`} className="text-brand-700 hover:underline">
                {year - 1}
              </Link>
              <Link href={`/settings/entitlements?year=${year + 1}`} className="text-brand-700 hover:underline">
                {year + 1}
              </Link>
            </div>
          }
        />
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              {types.map((t) => (
                <TH key={t.id} className="text-right">
                  {t.code}
                </TH>
              ))}
            </tr>
          </THead>
          <TBody>
            {employees.map((e) => (
              <TR key={e.id}>
                <TD>
                  <Link href={`/employees/${e.id}?tab=leave`} className="font-medium text-ink hover:text-brand-700">
                    {fullName(e)}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-slate-400">{e.employeeCode}</span>
                </TD>
                {types.map((t) => {
                  const en = e.leaveEntitlements.find((x) => x.leaveTypeId === t.id);
                  const total = en ? Number(en.entitledDays) + Number(en.carriedOver) + Number(en.adjustment) : null;
                  return (
                    <TD key={t.id} className="text-right tabular-nums">
                      {total === null ? <span className="text-slate-300">-</span> : total}
                    </TD>
                  );
                })}
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
