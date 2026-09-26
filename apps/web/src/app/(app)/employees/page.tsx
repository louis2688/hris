import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_STATUS_LABELS, employeeListQuerySchema } from "@hris/shared";
import { gate } from "@/server/auth/session";
import { listEmployees } from "@/server/services/employees";
import { listDepartments } from "@/server/services/org";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmploymentStatusBadge } from "@/components/status-badge";
import { fmtDate, fullName, toSearchParams } from "@/lib/utils";

export const metadata: Metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await gate("ADMIN", "HR");
  const raw = await searchParams;
  const q = employeeListQuerySchema.parse(raw);
  const [data, departments] = await Promise.all([listEmployees(q, null), listDepartments()]);
  const href = (page: number) => `/employees${toSearchParams({ ...raw, page })}`;

  return (
    <>
      <PageHeader
        title="Employees"
        description={`${data.total} people`}
        actions={
          <Link href="/employees/new" className={buttonVariants()}>
            <Plus /> Add employee
          </Link>
        }
      />
      <Card>
        <form className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_180px_180px_auto]" method="get">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={q.q} placeholder="Search name, ID or email" className="pl-9" aria-label="Search" />
          </div>
          <Select name="departmentId" defaultValue={q.departmentId ?? ""} aria-label="Department">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={q.status ?? ""} aria-label="Status">
            <option value="">All statuses</option>
            {EMPLOYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EMPLOYMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>

        {data.items.length === 0 ? (
          <EmptyState title="No employees match" description="Try a different search or clear the filters." action={<Link href="/employees" className={buttonVariants({ variant: "secondary", size: "sm" })}>Clear filters</Link>} />
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 sm:hidden">
              {data.items.map((e) => (
                <li key={e.id}>
                  <Link href={`/employees/${e.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                    <Avatar first={e.firstName} last={e.lastName} src={e.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{fullName(e)}</p>
                      <p className="truncate text-xs text-slate-500">
                        {e.jobTitle?.name ?? "No title"} · {e.department?.name ?? "No department"}
                      </p>
                    </div>
                    <EmploymentStatusBadge status={e.employmentStatus} />
                  </Link>
                </li>
              ))}
            </ul>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <Table>
                <THead>
                  <tr>
                    <TH>Employee</TH>
                    <TH>ID</TH>
                    <TH>Job title</TH>
                    <TH>Department</TH>
                    <TH>Manager</TH>
                    <TH>Hired</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {data.items.map((e) => (
                    <TR key={e.id}>
                      <TD>
                        <Link href={`/employees/${e.id}`} className="flex items-center gap-3">
                          <Avatar first={e.firstName} last={e.lastName} src={e.avatarUrl} size="sm" />
                          <span>
                            <span className="block font-medium text-ink hover:text-brand-700">{fullName(e)}</span>
                            <span className="block text-xs text-slate-500">{e.workEmail ?? e.user?.email ?? ""}</span>
                          </span>
                        </Link>
                      </TD>
                      <TD className="font-mono text-xs">{e.employeeCode}</TD>
                      <TD>{e.jobTitle?.name ?? "-"}</TD>
                      <TD>{e.department?.name ?? "-"}</TD>
                      <TD>{e.manager ? fullName(e.manager) : "-"}</TD>
                      <TD>{fmtDate(e.hireDate)}</TD>
                      <TD>
                        <EmploymentStatusBadge status={e.employmentStatus} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} makeHref={href} />
          </>
        )}
      </Card>
    </>
  );
}
