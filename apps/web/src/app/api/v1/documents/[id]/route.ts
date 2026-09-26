import { json, handler } from "@/server/api";
import { download, remove } from "@/server/services/documents";

export const GET = handler<{ id: string }>(async ({ params, user }) => {
  const { body, headers } = await download(user, params.id);
  return new Response(body, { headers });
});

export const DELETE = handler<{ id: string }>(async ({ params, user }) => {
  await remove(user, params.id);
  return json({ ok: true });
});
