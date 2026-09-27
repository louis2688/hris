import { describe, expect, it } from "vitest";
import { aiProviderFor, assistantRequestSchema, screeningResultSchema } from "./ai";

describe("aiProviderFor", () => {
  it("is not configured without a key or mock", () => {
    expect(aiProviderFor({})).toBeNull();
    expect(aiProviderFor({ ANTHROPIC_API_KEY: "" })).toBeNull();
  });
  it("prefers the mock provider, else the real key", () => {
    expect(aiProviderFor({ AI_PROVIDER: "mock", ANTHROPIC_API_KEY: "x" })).toBe("mock");
    expect(aiProviderFor({ ANTHROPIC_API_KEY: "sk-ant-x" })).toBe("anthropic");
  });
});

describe("schemas", () => {
  it("rejects over-long questions and non-user last turns", () => {
    expect(assistantRequestSchema.safeParse({ messages: [{ role: "user", content: "x".repeat(2001) }] }).success).toBe(false);
    expect(assistantRequestSchema.safeParse({ messages: [{ role: "assistant", content: "hi" }] }).success).toBe(false);
    expect(assistantRequestSchema.safeParse({ messages: [{ role: "user", content: "hi" }] }).success).toBe(true);
  });
  it("validates screening results", () => {
    const ok = { score: 80, summary: ["a"], strengths: [], gaps: [], nextStep: "Interview" };
    expect(screeningResultSchema.safeParse(ok).success).toBe(true);
    expect(screeningResultSchema.safeParse({ ...ok, score: 101 }).success).toBe(false);
    expect(screeningResultSchema.safeParse({ ...ok, score: 7.5 }).success).toBe(false);
  });
});
