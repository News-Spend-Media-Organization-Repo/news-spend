/// <reference types="bun" />
import { describe, expect, it } from "bun:test";

import {
  DEFAULT_DAILY_POINTS_CAP,
  DEFAULT_MAX_POINTS_PER_AWARD,
  MAX_POINTS_PER_AWARD_LIMIT,
  resolveSurveySettings,
} from "./surveySettings";

describe("resolveSurveySettings", () => {
  it("keeps today's providers on and the unverified ones off with no document", () => {
    const resolved = resolveSurveySettings(null);

    expect(resolved.providers.cpx.enabled).toBe(true);
    expect(resolved.providers.rapido.enabled).toBe(true);
    expect(resolved.providers.theorem.enabled).toBe(false);
    expect(resolved.providers.bitlabs.enabled).toBe(false);
    expect(resolved.dailyPointsCap).toBe(DEFAULT_DAILY_POINTS_CAP);
    expect(resolved.maxPointsPerAward).toBe(DEFAULT_MAX_POINTS_PER_AWARD);
  });

  it("lets one row disable a provider without touching the others", () => {
    const resolved = resolveSurveySettings({
      providers: [{ provider: "cpx", enabled: false }],
    });

    expect(resolved.providers.cpx.enabled).toBe(false);
    expect(resolved.providers.rapido.enabled).toBe(true);
  });

  it("normalises country codes and treats an empty list as every country", () => {
    const resolved = resolveSurveySettings({
      providers: [{ provider: "rapido", countries: [" ng ", "gh", ""] }],
    });

    expect(resolved.providers.rapido.countries).toEqual(["NG", "GH"]);
    expect(resolved.providers.cpx.countries).toEqual([]);
  });

  it("ignores unknown providers and invalid numbers", () => {
    const resolved = resolveSurveySettings({
      providers: [
        { provider: "not-a-provider", enabled: true },
        { provider: "theorem", priority: Number.NaN, enabled: "yes" as never },
      ],
      dailyPointsCap: -5,
      maxPointsPerAward: 999_999,
    });

    expect(resolved.providers.theorem.priority).toBe(0);
    expect(resolved.providers.theorem.enabled).toBe(false);
    expect(resolved.dailyPointsCap).toBe(DEFAULT_DAILY_POINTS_CAP);
    expect(resolved.maxPointsPerAward).toBe(MAX_POINTS_PER_AWARD_LIMIT);
  });

  it("keeps a configured wall URL and drops an empty one", () => {
    const resolved = resolveSurveySettings({
      providers: [
        { provider: "cpx", wallUrl: "  " },
        { provider: "rapido", wallUrl: "https://wall.example/?u={userId}" },
      ],
    });

    expect(resolved.providers.cpx.wallUrl).toBeNull();
    expect(resolved.providers.rapido.wallUrl).toBe(
      "https://wall.example/?u={userId}"
    );
  });
});
