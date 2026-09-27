import { handler, json } from "@/server/api";
import { pendingFor } from "@/server/services/requests";

/** GET /api/v1/requests/pending -> { overtime, coe, expenses, loans } awaiting the caller's decision. */
export const GET = handler(async ({ user }) => json(await pendingFor(user)), { roles: ["MANAGER", "HR", "ADMIN"] });
