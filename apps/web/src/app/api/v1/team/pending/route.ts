import { handler, json } from "@/server/api";
import { pendingApprovalsFor } from "@/server/services/leave";

/** GET /api/v1/team/pending -> requests awaiting the caller's decision. */
export const GET = handler(async ({ user }) => json({ items: await pendingApprovalsFor(user) }), { roles: ["MANAGER", "HR", "ADMIN"] });
