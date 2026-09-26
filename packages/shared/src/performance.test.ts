import { describe, expect, it } from "vitest";
import { computeFinalRating, kpiSchema, reviewFormSchema } from "./schemas/performance";

describe("computeFinalRating", () => {
  it("averages 1..5 ratings as-is", () => {
    expect(computeFinalRating([{ rating: 4, minRating: 1, maxRating: 5 }, { rating: 5, minRating: 1, maxRating: 5 }])).toBe(4.5);
  });
  it("normalizes other ranges onto 1..5", () => {
    expect(computeFinalRating([{ rating: 10, minRating: 1, maxRating: 10 }])).toBe(5);
    expect(computeFinalRating([{ rating: 0, minRating: 0, maxRating: 3 }, { rating: 5, minRating: 1, maxRating: 5 }])).toBe(3);
  });
  it("rounds to 2 decimals and ignores unrated", () => {
    expect(computeFinalRating([{ rating: 2, minRating: 1, maxRating: 4 }, { rating: null, minRating: 1, maxRating: 5 }])).toBe(2.33);
    expect(computeFinalRating([])).toBeNull();
  });
});

describe("reviewFormSchema", () => {
  it("treats blank ratings as unrated", () => {
    const r = reviewFormSchema.parse({ intent: "save", items: [{ id: "a", rating: "" }, { id: "b", rating: "3" }] });
    expect(r.items.map((i) => i.rating)).toEqual([undefined, 3]);
  });
});

describe("kpiSchema", () => {
  it("defaults blank scale to 1..5", () => {
    expect(kpiSchema.parse({ name: "X", minRating: "", maxRating: "", isActive: true })).toMatchObject({ minRating: 1, maxRating: 5 });
  });
});
