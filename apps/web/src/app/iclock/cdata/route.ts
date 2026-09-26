import type { NextRequest } from "next/server";
import { parseAttlog } from "@hris/shared";
import { admsToRows, deviceBySerial, ingestPunches } from "@/server/services/devices";

/**
 * ZKTeco ADMS push endpoint. Point the terminal's "Cloud Server" to this host (port 443/80), path handled by the device.
 * Auth is by registered serial number only (protocol limit). Restrict by IP with ADMS_ALLOWED_IPS="1.2.3.4,5.6.7.8".
 */
const text = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/plain" } });

function allowed(req: NextRequest) {
  const list = process.env.ADMS_ALLOWED_IPS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (!list?.length) return true;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return list.includes(ip);
}

async function device(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get("SN");
  if (!sn || !allowed(req)) return null;
  return deviceBySerial(sn);
}

// Handshake: device asks for its options.
export async function GET(req: NextRequest) {
  const d = await device(req);
  if (!d) return text("Unknown device", 404);
  const sn = d.serial;
  return text(
    [`GET OPTION FROM: ${sn}`, "ATTLOGStamp=None", "OPERLOGStamp=9999", "ATTPHOTOStamp=None", "ErrorDelay=30", "Delay=10", "TransTimes=00:00;14:05", "TransInterval=1", "TransFlag=TransData AttLog", "Realtime=1", "Encrypt=None"].join("\n"),
  );
}

// Data upload. Only ATTLOG is stored; other tables are acknowledged so the device does not retry forever.
export async function POST(req: NextRequest) {
  const d = await device(req);
  if (!d) return text("Unknown device", 404);
  const bodyText = await req.text();
  if (req.nextUrl.searchParams.get("table") !== "ATTLOG") return text("OK");
  const rows = admsToRows(parseAttlog(bodyText), d.location?.timezone);
  const res = rows.length ? await ingestPunches(d.id, rows) : { received: 0 };
  return text(`OK: ${res.received}`);
}
