import { describe, expect, it } from "bun:test";
import { resolveSurveySettings } from "@news-spend-media/payload/lib/surveySettings";

import {
  fallbackOffer,
  hasUsableUrl,
  rankOffers,
  runProvider,
  withTimeout,
} from "./ranking";
import type { UnifiedOffer } from "./schemas";

const offer = (
  id: string,
  provider: UnifiedOffer["provider"],
  points: number
): UnifiedOffer => ({
  id,
  provider,
  points,
  title: id,
  type: "survey",
  url: `https://${id}`,
});

const settings = resolveSurveySettings({
  providers: [
    { provider: "cpx", priority: 1 },
    { provider: "rapido", priority: 2 },
    {
      provider: "theorem",
      enabled: true,
      priority: 3,
      wallUrl: "https://wall/?u={userId}",
    },
  ],
});

describe("rankOffers", () => {
  it("puts a lower-priority provider first even when it pays less", () => {
    const ranked = rankOffers(
      [offer("r", "rapido", 900), offer("c", "cpx", 100)],
      settings,
      10
    );

    expect(ranked.map((o) => o.id)).toEqual(["c", "r"]);
  });

  it("breaks a priority tie by points, then id", () => {
    const even = resolveSurveySettings({
      providers: [
        { provider: "cpx", priority: 1 },
        { provider: "rapido", priority: 1 },
      ],
    });
    const ranked = rankOffers(
      [
        offer("b", "rapido", 100),
        offer("a", "cpx", 100),
        offer("c", "cpx", 500),
      ],
      even,
      10
    );

    expect(ranked.map((o) => o.id)).toEqual(["c", "a", "b"]);
  });

  it("applies the limit after ranking", () => {
    const ranked = rankOffers(
      [offer("a", "cpx", 1), offer("b", "cpx", 2)],
      settings,
      1
    );

    expect(ranked.map((o) => o.id)).toEqual(["b"]);
  });
});

describe("fallbackOffer", () => {
  it("uses the highest-priority enabled wall and fills the user id", () => {
    expect(fallbackOffer(settings, "user-1")).toMatchObject({
      id: "wall-theorem",
      provider: "theorem",
      points: 0,
      url: "https://wall/?u=user-1",
    });
  });

  it("returns null when no enabled provider has a wall", () => {
    expect(fallbackOffer(resolveSurveySettings(null), "user-1")).toBeNull();
  });

  it("ignores a disabled provider's wall", () => {
    const disabled = resolveSurveySettings({
      providers: [
        { provider: "cpx", enabled: false, wallUrl: "https://wall/cpx" },
      ],
    });

    expect(fallbackOffer(disabled, "user-1")).toBeNull();
  });
});

describe("hasUsableUrl", () => {
  it("rejects an offer whose url is missing or blank", () => {
    expect(hasUsableUrl(offer("a", "cpx", 10))).toBe(true);
    expect(hasUsableUrl({ ...offer("b", "cpx", 10), url: "" })).toBe(false);
    expect(hasUsableUrl({ ...offer("c", "cpx", 10), url: "  " })).toBe(false);
  });
});

describe("runProvider", () => {
  it("turns a rejection into an empty list", async () => {
    const result = await runProvider(
      "cpx",
      Promise.reject(new Error("boom")),
      50
    );

    expect(result).toEqual([]);
  });
});

describe("withTimeout", () => {
  it("resolves null instead of waiting for a hung provider", async () => {
    const hung = new Promise<number>((resolve) =>
      setTimeout(() => resolve(1), 1000)
    );

    expect(await withTimeout(hung, 5)).toBeNull();
  });

  it("passes a fast value through", async () => {
    expect(await withTimeout(Promise.resolve(1), 50)).toBe(1);
  });
});
