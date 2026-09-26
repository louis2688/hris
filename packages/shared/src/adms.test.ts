import { expect, it } from "vitest";
import { parseAttlog } from "./adms";

it("parses ATTLOG lines and skips junk", () => {
  const body = "101\t2026-10-05 08:58:12\t0\t1\t0\t0\n202\t2026-10-05 18:03:00\t1\t15\t0\n\nbad line\n";
  expect(parseAttlog(body)).toEqual([
    { biometricId: "101", date: "2026-10-05", time: "08:58:12", direction: "IN", method: "FINGERPRINT" },
    { biometricId: "202", date: "2026-10-05", time: "18:03:00", direction: "OUT", method: "FACE" },
  ]);
});
