import { describe, expect, it } from "vitest";
import {
  aggregateQuestion,
  countByValue,
  enps,
  goalWeightTotal,
  kAnonymous,
  meanOf,
  parseActionItems,
  surveySchema,
  trainingEventSchema,
  validateSurveyAnswers,
  type SurveyQuestion,
} from "./schemas/growth";
import { peerRequestSchema } from "./schemas/performance";

describe("enps", () => {
  it("is % promoters minus % detractors", () => {
    // 3 promoters, 2 passives, 3 detractors of 8
    expect(enps([10, 9, 9, 8, 7, 6, 3, 0])).toBe(0);
    expect(enps([10, 10, 9, 8])).toBe(75);
    expect(enps([0, 6, 5])).toBe(-100);
  });
  it("is null without scores", () => expect(enps([])).toBeNull());
});

describe("meanOf / countByValue", () => {
  it("averages to 2 decimals", () => {
    expect(meanOf([4, 5, 5])).toBe(4.67);
    expect(meanOf([])).toBeNull();
  });
  it("counts each value in range", () => expect(countByValue([1, 5, 5, 3], 1, 5)).toEqual([1, 0, 1, 0, 2]));
});

describe("kAnonymous", () => {
  it("drops groups below k", () => {
    const g = { Eng: [1, 2, 3, 4, 5], Sales: [1, 2], HR: [1, 2, 3, 4] };
    expect(Object.keys(kAnonymous(g))).toEqual(["Eng"]);
    expect(Object.keys(kAnonymous(g, 2)).sort()).toEqual(["Eng", "HR", "Sales"]);
  });
});

describe("validateSurveyAnswers", () => {
  const qs: SurveyQuestion[] = [
    { id: "a", type: "nps", text: "Recommend?", required: true },
    { id: "b", type: "rating", text: "Happy?", required: true },
    { id: "c", type: "choice", text: "Pick", required: false, options: ["X", "Y"] },
    { id: "d", type: "text", text: "Why?", required: false },
  ];
  it("coerces numbers and drops unknown keys", () => {
    expect(validateSurveyAnswers(qs, { a: "10", b: "4", c: "Y", zzz: "evil" })).toEqual({ answers: { a: 10, b: 4, c: "Y" } });
  });
  it("flags missing required and out-of-range", () => {
    expect(validateSurveyAnswers(qs, { a: "11", c: "Z" })).toEqual({ errors: { a: "Pick 0-10", b: "Required", c: "Pick one of the options" } });
  });
});

describe("aggregateQuestion", () => {
  it("aggregates nps and choice", () => {
    const r = aggregateQuestion({ id: "a", type: "nps", text: "", required: true }, [{ a: 10 }, { a: 9 }, { a: 3 }, {}]);
    expect(r).toMatchObject({ type: "nps", count: 3, enps: 33, average: 7.33 });
    const c = aggregateQuestion({ id: "c", type: "choice", text: "", required: true, options: ["X", "Y"] }, [{ c: "X" }, { c: "X" }, { c: "Y" }]);
    expect(c).toEqual({ type: "choice", count: 3, counts: [{ option: "X", count: 2 }, { option: "Y", count: 1 }] });
  });
});

describe("surveySchema", () => {
  it("parses questions from a JSON string and requires choice options", () => {
    const ok = surveySchema.safeParse({ title: "Pulse", questions: JSON.stringify([{ id: "q1", type: "nps", text: "Recommend us?" }]) });
    expect(ok.success && ok.data.questions[0]!.required).toBe(true);
    expect(surveySchema.safeParse({ title: "P", questions: [{ id: "q1", type: "choice", text: "Pick", options: ["only"] }] }).success).toBe(false);
  });
});

describe("goals + 1:1 helpers", () => {
  it("ignores dropped goals in the weight total", () => {
    expect(goalWeightTotal([{ weight: 60, status: "ON_TRACK" }, { weight: 40, status: "DONE" }, { weight: 30, status: "DROPPED" }])).toBe(100);
  });
  it("keeps done flags for unchanged action items", () => {
    expect(parseActionItems("- Ship it\n\n[x] Write docs\n  New one ", [{ text: "Ship it", done: true }])).toEqual([
      { text: "Ship it", done: true },
      { text: "[x] Write docs", done: false },
      { text: "New one", done: false },
    ]);
  });
});

describe("validation edges", () => {
  it("training event end must be after start", () => {
    expect(trainingEventSchema.safeParse({ programId: "p", title: "T", startsAt: "2026-10-01T09:00", endsAt: "2026-10-01T08:00" }).success).toBe(false);
  });
  it("peer requests are capped at 5", () => {
    expect(peerRequestSchema.safeParse({ reviewerIds: ["1", "2", "3", "4", "5", "6"] }).success).toBe(false);
    expect(peerRequestSchema.parse({ reviewerIds: "1" }).reviewerIds).toEqual(["1"]);
  });
});
