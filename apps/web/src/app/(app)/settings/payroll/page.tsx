import type { Metadata } from "next";
import { getPayrollConfig } from "@/server/services/payroll";
import { getSetting } from "@/server/services/settings";
import { CompanyForm, RatesForm } from "./forms";
import { gate } from "@/server/auth/session";

export const metadata: Metadata = { title: "Payroll settings" };

export default async function PayrollSettingsPage() {
  await gate("ADMIN", "HR"); // layouts are skipped on client navigations, so each page guards itself
  const [company, config] = await Promise.all([getSetting("company"), getPayrollConfig()]);
  return (
    <div className="space-y-6">
      <CompanyForm company={company} />
      <RatesForm config={config} />
    </div>
  );
}
