import { test, expect } from "@playwright/test";

// Per-email login throttle: 10 failed attempts / 15 min, then 429 with a generic message.
// A random x-forwarded-for keeps the per-IP bucket (20 / 15 min) fresh across runs; Vercel overwrites it in prod.
test("mobile login API throttles repeated failures for one email", async ({ request }) => {
  const rnd = Math.random().toString(36).slice(2);
  const email = `nobody-${rnd}@example.com`;
  const o = () => Math.floor(Math.random() * 254) + 1;
  const headers = { "x-forwarded-for": `100.${o()}.${o()}.${o()}, 10.0.0.1` };
  const attempt = () => request.post("/api/v1/auth/login", { data: { email, password: "wrong-password-1" }, headers });

  for (let i = 1; i <= 10; i++) expect((await attempt()).status(), `attempt ${i}`).toBe(401);

  const r = await attempt();
  expect(r.status()).toBe(429);
  expect(Number(r.headers()["retry-after"])).toBeGreaterThan(0);
  const { error } = await r.json();
  expect(error.code).toBe("RATE_LIMITED");
  expect(error.message).toMatch(/^Too many attempts, try again in \d+ minutes?$/);
});
