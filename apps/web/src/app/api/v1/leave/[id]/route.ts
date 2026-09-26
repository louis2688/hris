import { apiError, handler, json } from "@/server/api";
import { canAccessEmployee } from "@/server/authz";
import { getLeaveRequest } from "@/server/services/leave";

/** GET /api/v1/leave/:id */
export const GET = handler<{ id: string }>(async ({ params, user }) => {
  const r = await getLeaveRequest(params.id);
  if (!(await canAccessEmployee(user, r.employeeId))) return apiError(404, "NOT_FOUND", "Leave request not found");
  return json({ request: r });
});
