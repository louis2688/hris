import { handler, json } from "@/server/api";
import { acknowledge } from "@/server/services/announcements";

/** POST /api/v1/announcements/:id/ack -> acknowledge a policy (idempotent). */
export const POST = handler<{ id: string }>(async ({ user, params }) => {
  await acknowledge(user, params.id);
  return json({ ok: true });
});
