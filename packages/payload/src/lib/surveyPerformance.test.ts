import { describe, expect, it } from "bun:test";

import { summariseSurveyPerformance } from "./surveyPerformance";

describe("summariseSurveyPerformance", () => {
  it("counts calls and offers per provider", () => {
    const rows = summariseSurveyPerformance(
      [
        { provider: "cpx", offerCount: 3 },
        { provider: "cpx", offerCount: 0 },
        { provider: "rapido", offerCount: 1 },
      ],
      []
    );

    expect(rows.find((row) => row.provider === "cpx")).toMatchObject({
      calls: 2,
      offers: 3,
    });
    expect(rows.find((row) => row.provider === "rapido")).toMatchObject({
      calls: 1,
      offers: 1,
    });
  });

  it("counts awards, unique users, points and reversals", () => {
    const rows = summariseSurveyPerformance(
      [],
      [
        { metadata: { provider: "cpx" }, point: 100, user: "user-1" },
        { metadata: { provider: "cpx" }, point: 50, user: { id: "user-1" } },
        { metadata: { provider: "cpx" }, point: -100, user: "user-1" },
      ]
    );

    expect(rows.find((row) => row.provider === "cpx")).toMatchObject({
      awards: 2,
      users: 1,
      pointsIssued: 150,
      reversals: 1,
      pointsReversed: 100,
    });
  });

  it("ignores activities without a known provider and lists every provider", () => {
    const rows = summariseSurveyPerformance(
      [],
      [
        { metadata: { provider: "unknown" }, point: 100, user: "user-1" },
        { point: 100, user: "user-1" },
      ]
    );

    expect(rows.map((row) => row.provider)).toEqual([
      "cpx",
      "rapido",
      "theorem",
      "bitlabs",
    ]);
    expect(rows.every((row) => row.awards === 0)).toBe(true);
  });
});
