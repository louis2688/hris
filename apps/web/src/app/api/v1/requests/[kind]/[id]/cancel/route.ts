import { REQUEST_KINDS, type RequestKind } from "@hris/shared";
import { apiError, handler, json } from "@/server/api";
import { cancelRequest } from "@/server/services/requests";

/** POST /api/v1/requests/:kind/:id/cancel -> withdraw a pending request (owner or HR/Admin). */
export const POST = handler<{ kind: string; id: string }>(async ({ params, user }) => {
  if (!(REQUEST_KINDS as readonly string[]).includes(params.kind)) return apiError(404, "NOT_FOUND", "Unknown request type");
  await cancelRequest(user, params.kind as RequestKind, params.id);
  return json({ ok: true });
});
