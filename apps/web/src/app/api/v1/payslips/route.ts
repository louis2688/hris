import { handler, json } from "@/server/api";
import { listMyPayslips, payslipJson } from "@/server/services/payroll";

/** GET /api/v1/payslips -> the caller's released payslips (summary, newest first). */
export const GET = handler(async ({ user }) => {
  const items = user.employeeId ? await listMyPayslips(user.employeeId) : [];
  return json({ items: items.map(payslipJson) });
});
