import type { Metadata } from "next";
import { requireSession } from "@/server/auth/session";
import { getEmployee } from "@/server/services/employees";
import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui/card";
import { ProfileHero, ProfileOverview, TabNav } from "@/components/profile";
import { EmergencyContacts } from "@/components/emergency-contacts";
import { SelfEditForm } from "./self-edit-form";

export const metadata: Metadata = { title: "My Info" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "edit", label: "Edit contact details" },
  { key: "emergency", label: "Emergency contacts" },
];

export default async function MePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireSession();
  const { tab = "overview" } = await searchParams;
  if (!user.employeeId) {
    return (
      <Card>
        <EmptyState title="No employee profile linked" description="Your login is not linked to an employee record. Ask HR to link it." />
      </Card>
    );
  }
  const e = await getEmployee(user.employeeId);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="My Info" />
      <ProfileHero e={e} />
      <TabNav base="/me" tabs={TABS} active={tab} />
      {tab === "edit" ? (
        <Card>
          <CardBody>
            <SelfEditForm e={e} />
          </CardBody>
        </Card>
      ) : tab === "emergency" ? (
        <EmergencyContacts employeeId={e.id} contacts={e.emergencyContacts} />
      ) : (
        <ProfileOverview e={e} />
      )}
    </div>
  );
}
