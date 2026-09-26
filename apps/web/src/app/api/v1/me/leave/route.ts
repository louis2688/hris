import { leaveListQuerySchema } from "@hris/shared";
import { handler, json, query } from "@/server/api";
import { listLeaveRequests } from "@/server/services/leave";

/** GET /api/v1/me/leave?status=&page= -> own requests. */
export const GET = handler(async ({ req, user }) => {
  if (!user.employeeId) return json({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
  const q = query(req, leaveListQuerySchema);
  return json(await listLeaveRequests({ ...q, employeeId: user.employeeId }, null));
});
