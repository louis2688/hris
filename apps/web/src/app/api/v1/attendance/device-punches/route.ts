import { devicePunchesSchema } from "@hris/shared";
import { apiError, body, handler, json } from "@/server/api";
import { deviceByKey, ingestPunches } from "@/server/services/devices";

/**
 * POST /api/v1/attendance/device-punches
 * Header: X-Device-Key: dev_...   (Settings > Attendance > Devices > Generate key)
 * Body: { punches: [{ biometricId, at: ISO8601 with offset, method?: FINGERPRINT|FACE|CARD|PIN, direction?: IN|OUT }] }
 */
export const POST = handler(
  async ({ req }) => {
    const key = req.headers.get("x-device-key");
    const device = key ? await deviceByKey(key) : null;
    if (!device) return apiError(401, "INVALID_DEVICE_KEY", "Unknown or disabled device");
    const { punches } = await body(req, devicePunchesSchema);
    const res = await ingestPunches(device.id, punches.map((p) => ({ ...p, at: new Date(p.at) })));
    return json(res);
  },
  { roles: null },
);
