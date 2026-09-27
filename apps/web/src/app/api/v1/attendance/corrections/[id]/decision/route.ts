import { decisionSchema } from "@hris/shared";
import { body, handler, json } from "@/server/api";
import { decideCorrection } from "@/server/services/timeoff";

/** POST /api/v1/attendance/corrections/:id/decision { decision: APPROVED|REJECTED, note? } -> { added } punches */
export const POST = handler<{ id: string }>(
  async ({ req, params, user }) => {
    const data = await body(req, decisionSchema);
    return json(await decideCorrection(user, params.id, data));
  },
  { roles: ["MANAGER", "HR", "ADMIN"] },
);
