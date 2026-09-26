import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Palmtree } from "lucide-react";
import { leaveListQuerySchema } from "@hris/shared";
import { requireSession } from "@/server/auth/session";
import { canAccessEmployee, isStaff } from "@/server/authz";
import { getEmployee } from "@/server/services/employees";
import { getBalances, listLeaveRequests, listLeaveTypes } from "@/server/services/leave";
import { deleteEmployeeAction } from "@/server/actions/employees";
import { ConfirmButton } from "@/components/action-form";
import { buttonVariants } from "@/components/ui/button";
import { ProfileHero, ProfileOverview, TabNav } from "@/components/profile";
import { EmergencyContacts } from "@/components/emergency-contacts";
import { BalanceCards, LeaveRequestList } from "@/components/leave-widgets";
import { EmployeeForm } from "../employee-form";
import { loadFormOptions } from "../options";
import { AccountPanel } from "./account-panel";
import { QualTab } from "@/components/qual-tab";
import { EntitlementEditor } from "./entitlement-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const e = await getEmployee(id);
    return { title: `${e.firstName} ${e.lastName}` };
  } catch {
    return { title: "Employee" };
  }
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "personal", label: "Personal" },
  { key: "job", label: "Job" },
  { key: "contact", label: "Contact" },
  { key: "emergency", label: "Emergency" },
  { key: "qualifications", label: "Qualifications" },
  { key: "leave", label: "Leave" },
  { key: "account", label: "Account" },
];

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab = "overview" }] = await Promise.all([params, searchParams]);
  const user = await requireSession();
  if (!(await canAccessEmployee(user, id))) notFound();
  const staff = isStaff(user);
  const e = await getEmployee(id).catch(() => null);
  if (!e) notFound();

  // Managers viewing a report: overview + leave only.
  const tabs = staff ? TABS : TABS.filter((t) => t.key === "overview" || t.key === "leave");
  const active = tabs.some((t) => t.key === tab) ? tab : "overview";

  return (
    <div className="mx-auto max-w-5xl">
      <p className="mb-3 text-sm">
        <Link href="/employees" className="text-slate-500 hover:text-brand-700">
          Employees
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-700">{e.firstName} {e.lastName}</span>
      </p>
      <ProfileHero
        e={e}
        actions={
          staff ? (
            <>
              <Link href={`/me/leave?new=1&employeeId=${e.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                <Palmtree /> File leave
              </Link>
              {user.role === "ADMIN" && e.user?.id !== user.id ? (
                <ConfirmButton action={deleteEmployeeAction.bind(null, e.id)} confirm={`Remove ${e.firstName} ${e.lastName}? Their account will be deactivated and they will be marked terminated.`} size="sm">
                  Remove
                </ConfirmButton>
              ) : null}
            </>
          ) : undefined
        }
      />
      <TabNav base={`/employees/${e.id}`} tabs={tabs} active={active} />

      {active === "overview" ? <ProfileOverview e={e} showLinks /> : null}
      {active === "personal" || active === "job" || active === "contact" ? (
        <EmployeeForm mode="edit" id={e.id} initial={e} options={await loadFormOptions()} section={active} />
      ) : null}
      {active === "emergency" ? <EmergencyContacts employeeId={e.id} contacts={e.emergencyContacts} /> : null}
      {active === "qualifications" ? <QualTab employeeId={e.id} /> : null}
      {active === "leave" ? <LeaveTab employeeId={e.id} staff={staff} /> : null}
      {active === "account" ? <AccountPanel employeeId={e.id} account={e.user} defaultEmail={e.workEmail ?? ""} isSelf={e.user?.id === user.id} isAdmin={user.role === "ADMIN"} /> : null}
    </div>
  );
}

async function LeaveTab({ employeeId, staff }: { employeeId: string; staff: boolean }) {
  const year = new Date().getUTCFullYear();
  const [balances, requests, types] = await Promise.all([
    getBalances(employeeId, year),
    listLeaveRequests(leaveListQuerySchema.parse({ employeeId, pageSize: 50 }), null),
    listLeaveTypes(true),
  ]);
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Balances {year}</h2>
        <BalanceCards balances={balances} />
      </section>
      {staff ? <EntitlementEditor employeeId={employeeId} year={year} balances={balances} types={types.map((t) => ({ id: t.id, name: t.name }))} /> : null}
      <LeaveRequestList items={requests.items} showEmployee={false} title="Leave history" />
    </div>
  );
}

