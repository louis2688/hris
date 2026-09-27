import { handler, json } from "@/server/api";
import { feedForApi } from "@/server/services/announcements";

/** GET /api/v1/announcements -> published feed, pinned first, with the caller's ackedAt. */
export const GET = handler(async ({ user }) => json({ items: await feedForApi(user) }));
