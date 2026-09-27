import type { Metadata } from "next";
import { getPayrollConfig } from "@/server/services/payroll";
import { getSetting } from "@/server/services/settings";
import { CompanyForm, RatesForm } from "./forms";

export const metadata: Metadata = { title: "Payroll settings" };

export default async function PayrollSettingsPage() {
  const [company, config] = await Promise.all([getSetting("company"), getPayrollConfig()]);
  return (
    <div className="space-y-6">
      <CompanyForm company={company} />
      <RatesForm config={config} />
    </div>
  );
}
