import Link from "next/link";
import { Download } from "lucide-react";
import type { Report } from "@/server/services/reports";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PrintButton } from "@/components/print-button";
import { cn } from "@/lib/utils";

/** Labelled filter control for the report form (implicit label so getByLabel works). */
export function ReportFilter({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("grid w-full gap-1.5 text-sm font-medium text-slate-700 sm:w-48", className)}>
      {label}
      {children}
    </label>
  );
}

export function DepartmentFilter({ departments, value }: { departments: { id: string; name: string }[]; value?: string }) {
  if (!departments.length) return null;
  return (
    <ReportFilter label="Department">
      <Select name="departmentId" defaultValue={value ?? ""}>
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
    </ReportFilter>
  );
}

/** Report page body: header with CSV + Print, GET filter form (children), and the table with totals. */
export function ReportTable({ slug, query, report, children }: { slug: string; query: string; report: Report; children: React.ReactNode }) {
  const { columns, rows, totals } = report;
  const csv = `/api/v1/reports/${slug}${query ? `?${query}` : ""}`;
  const cell = (v: string | number | undefined) => (v === "" || v === undefined ? "-" : v);
  return (
    <>
      <PageHeader
        title={report.title}
        description={report.description}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Link href="/reports" className={buttonVariants({ variant: "ghost" })}>
              All reports
            </Link>
            <a href={csv} download className={buttonVariants({ variant: "secondary" })}>
              <Download /> Download CSV
            </a>
            <PrintButton />
          </div>
        }
      />
      <Card className="mb-4 print:hidden">
        <form method="get" className="flex flex-wrap items-end gap-3 p-4">
          {children}
          <Button type="submit" variant="secondary">
            Run report
          </Button>
        </form>
      </Card>
      <Card className="overflow-hidden print:shadow-none print:ring-0">
        {rows.length === 0 ? (
          <EmptyState title="No data" description="Nothing matches these filters." />
        ) : (
          <Table className="print:min-w-0 print:text-xs">
            <THead>
              <tr>
                {columns.map((c) => (
                  <TH key={c.key} className={cn(c.num && "text-right")}>
                    {c.label}
                  </TH>
                ))}
              </tr>
            </THead>
            <TBody>
              {rows.map((r, i) => (
                <TR key={i} className="break-inside-avoid">
                  {columns.map((c) => (
                    <TD key={c.key} className={cn("print:px-2 print:py-1", c.num && "text-right tabular-nums")}>
                      {cell(r[c.key])}
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
            {totals ? (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50/80 font-semibold">
                <tr>
                  {columns.map((c) => (
                    <TD key={c.key} className={cn("print:px-2 print:py-1", c.num && "text-right tabular-nums")}>
                      {totals[c.key] ?? ""}
                    </TD>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </Table>
        )}
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </p>
      </Card>
    </>
  );
}
