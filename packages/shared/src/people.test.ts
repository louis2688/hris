import { describe, expect, it } from "vitest";
import { parseMarkdownLite } from "./schemas/people";

describe("parseMarkdownLite", () => {
  it("splits paragraphs and lists, parses bold and safe links", () => {
    const b = parseMarkdownLite("Hello **team**\nsee [policy](https://x.ph/p)\n\n- one\n- two\n1. first\n\n[bad](javascript:alert(1))");
    expect(b.map((x) => x.type)).toEqual(["p", "ul", "ol", "p"]);
    expect(b[0]).toEqual({ type: "p", lines: [[{ t: "text", v: "Hello " }, { t: "b", v: "team" }], [{ t: "text", v: "see " }, { t: "a", v: "policy", href: "https://x.ph/p" }]] });
    expect(b[1]).toEqual({ type: "ul", items: [[{ t: "text", v: "one" }], [{ t: "text", v: "two" }]] });
    expect(b[3]!.type === "p" && b[3]!.lines[0]!.some((i) => i.t === "a")).toBe(false);
  });
});
