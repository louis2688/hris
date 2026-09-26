import { handler, json } from "@/server/api";
import { listLeaveTypes } from "@/server/services/leave";

/** GET /api/v1/leave-types -> active leave types. */
export const GET = handler(async () => json({ items: await listLeaveTypes(true) }));
