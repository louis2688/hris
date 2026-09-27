// Run: node --test src/server/redact.test.mjs   (Node 22.18+ strips the .ts types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditSafe } from "./redact.ts";

test("audit rows drop secrets and bytes, keep the rest", () => {
  const row = {
    id: "d1", name: "Front door", serial: "ABC", apiKeyHash: "f00", user: { email: "a@b.c", passwordHash: "$2a$..." },
    token: "offer-token", tokenHash: "x", clientSecret: "s", photo: Buffer.from([1, 2, 3]), bytes: new Uint8Array([9]), at: new Date(0), sha256: "keep",
  };
  assert.deepEqual(auditSafe(row), {
    id: "d1", name: "Front door", serial: "ABC", apiKeyHash: "[redacted]", user: { email: "a@b.c", passwordHash: "[redacted]" },
    token: "[redacted]", tokenHash: "[redacted]", clientSecret: "[redacted]", photo: "[bytes]", bytes: "[bytes]", at: "1970-01-01T00:00:00.000Z", sha256: "keep",
  });
  assert.equal(auditSafe(undefined), undefined);
  assert.equal(auditSafe("plain"), "plain");
});
