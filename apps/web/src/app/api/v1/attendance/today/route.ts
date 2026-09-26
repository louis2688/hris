import { z } from "zod";
import { body, handler, json } from "@/server/api";
import { recordPunch, todaysPunches } from "@/server/services/attendance";

/** GET: today's punches + clocked-in state. POST: punch (mobile). */
export const GET = handler(async ({ user }) => {
  if (!user.employeeId) return json({ punches: [], clockedIn: false });
  const t = await todaysPunches(user.employeeId);
  return json({ day: t.day, clockedIn: t.clockedIn, shift: t.shift, punches: t.punches });
});

// ponytail: mobile punches carry no server-verifiable biometric yet; add passkey assertion here when the app ships.
export const POST = handler(async ({ req, user }) => {
  const d = await body(req, z.object({ latitude: z.number().optional(), longitude: z.number().optional(), photo: z.string().max(400_000).optional() }));
  const photo = d.photo ? Buffer.from(d.photo.replace(/^data:image\/\w+;base64,/, ""), "base64") : undefined;
  const p = await recordPunch(user, { method: photo ? "PHOTO" : "NONE", photo, latitude: d.latitude, longitude: d.longitude, source: "MOBILE" });
  return json({ punch: p }, 201);
});
