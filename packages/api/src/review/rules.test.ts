import { describe, expect, test } from "bun:test";

import {
  cooldownCutoff,
  isLoyal,
  LOYAL_MIN,
  REVIEW_COOLDOWN_DAYS,
} from "./rules";

const AT_THRESHOLD = {
  accountAgeDays: 7,
  activeDays: 7,
  sessions: 10,
  activities: 1,
};

describe("isLoyal", () => {
  test("is true at exactly the thresholds", () => {
    expect(isLoyal(AT_THRESHOLD)).toBe(true);
  });

  test.each([
    ["account age", { accountAgeDays: 6 }],
    ["active days", { activeDays: 6 }],
    ["sessions", { sessions: 9 }],
    ["activities", { activities: 0 }],
  ])("is false when %s is one below the threshold", (_name, override) => {
    expect(isLoyal({ ...AT_THRESHOLD, ...override })).toBe(false);
  });

  test("is false for many sessions with no meaningful activity", () => {
    expect(
      isLoyal({
        accountAgeDays: 90,
        activeDays: 30,
        sessions: 200,
        activities: 0,
      })
    ).toBe(false);
  });
});

describe("constants", () => {
  test("match the spec", () => {
    expect(REVIEW_COOLDOWN_DAYS).toBe(90);
    expect(LOYAL_MIN).toEqual({
      accountAgeDays: 7,
      activeDays: 7,
      sessions: 10,
      activities: 1,
    });
  });
});

describe("cooldownCutoff", () => {
  test("is 90 days before now", () => {
    const cutoff = cooldownCutoff(new Date("2026-10-21T00:00:00Z"));
    expect(cutoff.toISOString()).toBe("2026-07-23T00:00:00.000Z");
  });
});
