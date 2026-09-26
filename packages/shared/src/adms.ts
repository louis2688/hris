import type { PunchMethod } from "./constants";

/**
 * ZKTeco ADMS (push SDK) ATTLOG parser.
 * Line format: PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify \t workcode ...
 * status: 0 check-in, 1 check-out, 2 break-out, 3 break-in, 4 OT-in, 5 OT-out.
 * verify: 0 password, 1 fingerprint, 2 card, 15 face (per ZK push protocol; confirm against your model's manual).
 */
export interface AdmsPunch {
  biometricId: string;
  date: string; // device local
  time: string; // HH:mm:ss device local
  direction: "IN" | "OUT" | null;
  method: PunchMethod;
}

const VERIFY: Record<string, PunchMethod> = { "0": "PIN", "1": "FINGERPRINT", "2": "CARD", "3": "PIN", "4": "CARD", "15": "FACE" };
const STATUS: Record<string, "IN" | "OUT"> = { "0": "IN", "1": "OUT", "2": "OUT", "3": "IN", "4": "IN", "5": "OUT" };

export function parseAttlog(body: string): AdmsPunch[] {
  const out: AdmsPunch[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const cols = raw.split("\t");
    const [pin, stamp, status, verify] = cols;
    const m = stamp?.trim().match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/);
    if (!pin?.trim() || !m) continue;
    out.push({ biometricId: pin.trim(), date: m[1]!, time: m[2]!, direction: STATUS[status?.trim() ?? ""] ?? null, method: VERIFY[verify?.trim() ?? ""] ?? "FINGERPRINT" });
  }
  return out;
}
