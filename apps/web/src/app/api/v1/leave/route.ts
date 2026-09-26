import { createLeaveRequestSchema, leaveListQuerySchema } from "@hris/shared";
import { body, handler, json, query } from "@/server/api";
import { visibleEmployeeIds } from "@/server/authz";
import { createLeaveRequest, listLeaveRequests } from "@/server/services/leave";

/** GET /api/v1/leave -> requests visible to the caller (self, team, or everyone for HR/Admin). */
export const GET = handler(async ({ req, user }) => {
  const q = query(req, leaveListQuerySchema);
  return json(await listLeaveRequests(q, await visibleEmployeeIds(user)));
});

/** POST /api/v1/leave -> create a request (HR/Admin may pass employeeId). */
export const POST = handler(async ({ req, user }) => {
  const data = await body(req, createLeaveRequestSchema);
  return json({ request: await createLeaveRequest(user, data) }, 201);
});
