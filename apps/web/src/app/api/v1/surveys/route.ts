import { handler, json } from "@/server/api";
import { surveysForMe } from "@/server/services/surveys";

/** GET /api/v1/surveys -> live surveys addressed to the caller, with questions and `answered`. */
export const GET = handler(async ({ user }) => json({ surveys: await surveysForMe(user) }));
