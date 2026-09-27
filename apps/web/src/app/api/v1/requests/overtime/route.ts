import { overtimeSchema } from "@hris/shared";
import { body, handler, json } from "@/server/api";
import { createOvertime } from "@/server/services/requests";

/** POST /api/v1/requests/overtime { date, startTime, endTime, reason } */
export const POST = handler(async ({ req, user }) => json({ request: await createOvertime(user, await body(req, overtimeSchema)) }, 201));
