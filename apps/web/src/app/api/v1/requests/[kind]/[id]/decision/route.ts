import { REQUEST_KINDS, requestDecisionSchema, type RequestKind } from "@hris/shared";
import { apiError, body, handler, json } from "@/server/api";
import { decideRequest } from "@/server/services/requests";

/** POST /api/v1/requests/:kind/:id/decision { decision: APPROVED|REJECTED, note? }; kind = overtime|coe|expenses|loans */
export const POST = handler<{ kind: string; id: string }>(
  async ({ req, params, user }) => {
    if (!(REQUEST_KINDS as readonly string[]).includes(params.kind)) return apiError(404, "NOT_FOUND", "Unknown request type");
    await decideRequest(user, params.kind as RequestKind, params.id, await body(req, requestDecisionSchema));
    return json({ ok: true });
  },
  { roles: ["MANAGER", "HR", "ADMIN"] },
);
