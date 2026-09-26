import { cancelLeaveRequestSchema } from "@hris/shared";
import { body, handler, json } from "@/server/api";
import { cancelLeaveRequest } from "@/server/services/leave";

/** POST /api/v1/leave/:id/cancel { note? } */
export const POST = handler<{ id: string }>(async ({ req, params, user }) => {
  const { note } = await body(req, cancelLeaveRequestSchema);
  return json({ request: await cancelLeaveRequest(user, params.id, note) });
});
