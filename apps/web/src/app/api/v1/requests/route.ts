import { handler, json } from "@/server/api";
import { AppError } from "@/server/services/errors";
import { listMine } from "@/server/services/requests";

/** GET /api/v1/requests -> the caller's { overtime, coe, expenses, loans } (newest 100 each). */
export const GET = handler(async ({ user }) => {
  if (!user.employeeId) throw new AppError("No employee record linked to this account", "NO_EMPLOYEE");
  return json(await listMine(user.employeeId));
});
