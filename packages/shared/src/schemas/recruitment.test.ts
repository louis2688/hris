import { describe, expect, it } from "vitest";
import { candidateSchema } from "./recruitment";

describe("candidateSchema.resumeUrl", () => {
  const base = { firstName: "A", lastName: "B", email: "a@b.co" };
  it("accepts http(s) links and blank", () => {
    expect(candidateSchema.parse({ ...base, resumeUrl: "https://drive.google.com/x" }).resumeUrl).toBe("https://drive.google.com/x");
    expect(candidateSchema.parse({ ...base, resumeUrl: "" }).resumeUrl).toBeUndefined();
  });
  it("rejects script and data URLs", () => {
    for (const u of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x"]) expect(candidateSchema.safeParse({ ...base, resumeUrl: u }).success).toBe(false);
  });
});
