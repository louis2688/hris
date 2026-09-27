import type { Metadata } from "next";
import { getAccounting } from "@/server/services/payroll";
import { departmentOptions } from "@/server/services/org";
import { AccountingForm } from "./form";

export const metadata: Metadata = { title: "Accounting settings" };

export default async function AccountingSettingsPage() {
  const [map, depts] = await Promise.all([getAccounting(), departmentOptions()]);
  return <AccountingForm map={map} departments={depts.map((d) => d.name)} />;
}
