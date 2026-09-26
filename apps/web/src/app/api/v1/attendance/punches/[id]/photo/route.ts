import { apiError, handler } from "@/server/api";
import { canAccessEmployee } from "@/server/authz";
import { punchPhoto } from "@/server/services/attendance";

export const GET = handler<{ id: string }>(async ({ params, user }) => {
  const p = await punchPhoto(params.id);
  if (!p?.photo || !(await canAccessEmployee(user, p.employeeId))) return apiError(404, "NOT_FOUND", "No photo");
  return new Response(new Uint8Array(p.photo), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
});
