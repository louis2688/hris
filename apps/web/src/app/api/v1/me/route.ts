import { employeeSelfUpdateSchema } from "@hris/shared";
import { body, handler, json } from "@/server/api";
import { getEmployee, updateSelf } from "@/server/services/employees";

/** GET /api/v1/me -> session user + employee profile. */
export const GET = handler(async ({ user }) => {
  const employee = user.employeeId ? await getEmployee(user.employeeId) : null;
  return json({ user, employee });
});

/** PATCH /api/v1/me -> update own contact details. */
export const PATCH = handler(async ({ req, user }) => {
  const data = await body(req, employeeSelfUpdateSchema);
  return json({ employee: await updateSelf(user, data) });
});
