import { json, handler } from "@/server/api";
import { acknowledge } from "@/server/services/documents";

/** POST /api/v1/documents/:id/ack -> the signed-in employee acknowledges their document (idempotent). */
export const POST = handler<{ id: string }>(async ({ params, user }) => {
  const row = await acknowledge(user, params.id);
  return json({ ok: true, ackedAt: row.ackedAt });
});
