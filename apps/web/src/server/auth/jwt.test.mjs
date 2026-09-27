// Run: node --test src/server/auth/jwt.test.mjs   (Node 22.18+ strips the .ts types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { signToken, verifyToken } from "./jwt.ts";

process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
const key = new TextEncoder().encode(process.env.AUTH_SECRET);
const user = { id: "u1", email: "a@b.c", role: "EMPLOYEE", employeeId: "e1", name: "A B" };

test("session tokens round-trip", async () => {
  const v = await verifyToken(await signToken(user, "session"));
  assert.equal(v?.id, "u1");
  assert.equal(v?.role, "EMPLOYEE");
});

test("only HS256 is accepted, even with the right secret", async () => {
  const hs512 = await new SignJWT({ ...user, role: "ADMIN" }).setProtectedHeader({ alg: "HS512" }).setSubject("u1").setExpirationTime("1h").sign(key);
  assert.equal(await verifyToken(hs512), null);
});

test("alg none and tampered tokens are rejected", async () => {
  const [, body] = (await signToken(user, "session")).split(".");
  const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${body}.`;
  assert.equal(await verifyToken(none), null);
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), role: "ADMIN" })).toString("base64url");
  const [h, , sig] = (await signToken(user, "session")).split(".");
  assert.equal(await verifyToken(`${h}.${forged}.${sig}`), null);
});

test("expired tokens are rejected", async () => {
  const old = await new SignJWT({ ...user }).setProtectedHeader({ alg: "HS256" }).setSubject("u1").setExpirationTime(Math.floor(Date.now() / 1000) - 10).sign(key);
  assert.equal(await verifyToken(old), null);
});
