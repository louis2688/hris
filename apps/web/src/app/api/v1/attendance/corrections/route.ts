import { correctionSchema } from "@hris/shared";
import { body, handler, json } from "@/server/api";
import { createCorrection, listCorrections } from "@/server/services/timeoff";

/** GET /api/v1/attendance/corrections -> { mine, toDecide } (toDecide empty for employees). */
export const GET = handler(async ({ user }) => json(await listCorrections(user)));

/** POST /api/v1/attendance/corrections { date, kind, inTime?, outTime?, reason } */
export const POST = handler(async ({ req, user }) => {
  const data = await body(req, correctionSchema);
  return json({ correction: await createCorrection(user, data) }, 201);
});
