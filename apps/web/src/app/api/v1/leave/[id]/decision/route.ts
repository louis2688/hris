import { decideLeaveRequestSchema } from "@hris/shared";
import { body, handler, json } from "@/server/api";
import { decideLeaveRequest } from "@/server/services/leave";

/** POST /api/v1/leave/:id/decision { decision: APPROVED|REJECTED, note? } */
export const POST = handler<{ id: string }>(
  async ({ req, params, user }) => {
    const data = await body(req, decideLeaveRequestSchema);
    return json({ request: await decideLeaveRequest(user, params.id, data) });
  },
  { roles: ["MANAGER", "HR", "ADMIN"] },
);
