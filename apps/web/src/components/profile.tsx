import Link from "next/link";
import type { EmployeeDetail } from "@/server/services/employees";
import { EMPLOYMENT_TYPE_LABELS } from "@hris/shared";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmploymentStatusBadge } from "@/components/status-badge";
import { cn, fmtDate, fullName } from "@/lib/utils";

export function ProfileHero({ e, actions }: { e: EmployeeDetail; actions?: React.ReactNode }) {
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="h-20 bg-blue-600 dark:bg-blue-800" aria-hidden />
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar first={e.firstName} last={e.lastName} src={e.avatarUrl} size="xl" className="-mt-14 shrink-0 ring-4 ring-card" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[26px] font-bold leading-[1.05] tracking-[-0.02em]">{fullName(e)}</h1>
            <EmploymentStatusBadge status={e.employmentStatus} />
          </div>
          <p className="mt-0.5 text-sm text-slate-600">
            {e.jobTitle?.name ?? "No job title"}
            {e.department ? ` · ${e.department.name}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            <span className="font-mono">{e.employeeCode}</span>
            {e.location ? ` · ${e.location.name}` : ""} · Joined {fmtDate(e.hireDate)}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 sm:self-center">{actions}</div> : null}
      </CardBody>
    </Card>
  );
}

export function TabNav({ base, tabs, active }: { base: string; tabs: { key: string; label: string }[]; active: string }) {
  return (
    <nav className="mb-6 -mx-4 overflow-x-auto px-4 scrollbar-thin lg:mx-0 lg:px-0" aria-label="Sections">
      <ul className="inline-flex gap-1 rounded-full bg-slate-100 p-1">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link
              href={t.key === tabs[0]?.key ? base : `${base}?tab=${t.key}`}
              className={cn(
                "inline-block whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                active === t.key ? "bg-card text-ink shadow-card" : "text-slate-600 hover:text-ink",
              )}
              aria-current={active === t.key ? "page" : undefined}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function DL({ items, cols = 2 }: { items: [string, React.ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4", cols === 3 ? "sm:grid-cols-3" : cols === 2 ? "sm:grid-cols-2" : "")}>
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 text-sm text-slate-800">{v === null || v === undefined || v === "" ? <span className="text-slate-400">-</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

const cap = (s: string | null | undefined) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : null);

export function ProfileOverview({ e, showLinks }: { e: EmployeeDetail; showLinks?: boolean }) {
  const mgr = e.manager ? (showLinks ? <Link href={`/employees/${e.manager.id}`} className="text-brand-700 hover:underline">{fullName(e.manager)}</Link> : fullName(e.manager)) : null;
  return (
    <div className="stagger grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Personal" />
        <CardBody>
          <DL
            items={[
              ["Full name", `${e.firstName} ${e.middleName ? e.middleName + " " : ""}${e.lastName}`],
              ["Preferred name", e.preferredName],
              ["Gender", cap(e.gender)],
              ["Date of birth", e.dateOfBirth ? fmtDate(e.dateOfBirth) : null],
              ["Marital status", cap(e.maritalStatus)],
              ["Nationality", e.nationality],
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Job" />
        <CardBody>
          <DL
            items={[
              ["Employee ID", <span key="c" className="font-mono">{e.employeeCode}</span>],
              ["Job title", e.jobTitle?.name],
              ["Department", e.department?.name],
              ["Location", e.location?.name],
              ["Reports to", mgr],
              ["Employment type", EMPLOYMENT_TYPE_LABELS[e.employmentType]],
              ["Hire date", fmtDate(e.hireDate)],
              ["Termination date", e.terminationDate ? fmtDate(e.terminationDate) : null],
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Contact" />
        <CardBody>
          <DL
            items={[
              ["Work email", e.workEmail ? <a key="w" href={`mailto:${e.workEmail}`} className="text-brand-700 hover:underline">{e.workEmail}</a> : null],
              ["Personal email", e.personalEmail],
              ["Phone", e.phone ? <a key="p" href={`tel:${e.phone}`} className="hover:underline">{e.phone}</a> : null],
              ["Mobile", e.mobile ? <a key="m" href={`tel:${e.mobile}`} className="hover:underline">{e.mobile}</a> : null],
              ["Address", [e.addressLine1, e.addressLine2, [e.city, e.state, e.postalCode].filter(Boolean).join(" "), e.country].filter(Boolean).join(", ") || null],
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Emergency contacts" />
        {e.emergencyContacts.length === 0 ? (
          <CardBody className="text-sm text-slate-500">None added.</CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {e.emergencyContacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {c.name} {c.isPrimary ? <span className="ml-1 rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium text-ink ring-1 ring-inset ring-hairline">Primary</span> : null}
                  </p>
                  <p className="text-xs text-slate-500">{c.relationship}</p>
                </div>
                <a href={`tel:${c.phone}`} className="text-slate-700 hover:underline">
                  {c.phone}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {e.reports.length ? (
        <Card className="lg:col-span-2">
          <CardHeader title="Direct reports" description={`${e.reports.length} people`} />
          <ul className="grid gap-1 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {e.reports.map((r) => (
              <li key={r.id}>
                <Link href={showLinks ? `/employees/${r.id}` : "#"} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                  <Avatar first={r.firstName} last={r.lastName} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{fullName(r)}</span>
                    <span className="block truncate text-xs text-slate-500">{r.jobTitle?.name ?? ""}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
