import type { NextRequest } from "next/server";
import { deviceBySerial } from "@/server/services/devices";
import { prisma } from "@hris/db";

// Device polls for commands. We have none; heartbeat updates lastSeenAt.
export async function GET(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get("SN");
  const d = sn ? await deviceBySerial(sn) : null;
  if (d) await prisma.biometricDevice.update({ where: { id: d.id }, data: { lastSeenAt: new Date() } });
  return new Response("OK", { headers: { "content-type": "text/plain" } });
}
