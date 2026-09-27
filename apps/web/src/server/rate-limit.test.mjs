// Run: node --test src/server/rate-limit.test.mjs   (Node 22.18+ strips the .ts types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, loginKeys, tooManyMessage } from "./rate-limit.ts";

test("clientIp takes the first x-forwarded-for hop, then x-real-ip", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "", "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(clientIp(new Headers()), "unknown");
});

test("login keys normalise the email", () => {
  assert.deepEqual(loginKeys("  Juan@Example.COM ", "1.2.3.4"), { ip: "login:ip:1.2.3.4", email: "login:email:juan@example.com" });
});

test("tooManyMessage rounds up to whole minutes", () => {
  assert.equal(tooManyMessage(1), "Too many attempts, try again in 1 minute");
  assert.equal(tooManyMessage(61), "Too many attempts, try again in 2 minutes");
  assert.equal(tooManyMessage(900), "Too many attempts, try again in 15 minutes");
});
