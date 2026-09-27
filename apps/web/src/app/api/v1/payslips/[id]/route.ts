import { handler, json } from "@/server/api";
import { getPayslipFor, payslipJson } from "@/server/services/payroll";

/** GET /api/v1/payslips/:id -> one payslip with lines and YTD. Own released payslips only (HR/Admin: any). */
export const GET = handler<{ id: string }>(async ({ params, user }) => json({ payslip: payslipJson(await getPayslipFor(user, params.id)) }));
