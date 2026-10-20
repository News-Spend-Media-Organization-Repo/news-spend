import { describe, expect, test } from "bun:test";

import {
  canPayOnTap,
  isEarnPlacement,
  isEarnRequest,
  isOfferPlacement,
} from "../src/lib/earnPlacements";

describe("placement predicates", () => {
  test("offer placements are earn placements", () => {
    expect(isOfferPlacement("lucky-app-wall")).toBe(true);
    expect(isOfferPlacement("connect-brand-video")).toBe(false);
    expect(isEarnPlacement("connect-brand-video")).toBe(true);
    expect(isEarnPlacement("news-click-ads")).toBe(false);
  });
});

describe("isEarnRequest", () => {
  test("is false for undefined and empty lists", () => {
    expect(isEarnRequest(undefined)).toBe(false);
    expect(isEarnRequest([])).toBe(false);
  });

  test("is true only when every placement is an earn placement", () => {
    expect(isEarnRequest(["lucky-app-wall"])).toBe(true);
    expect(isEarnRequest(["lucky-app-wall", "news-click-ads"])).toBe(false);
  });
});

describe("canPayOnTap", () => {
  test("pays when the surface is an offer placement the request asked for", () => {
    expect(
      canPayOnTap({ surface: "lucky-app-wall", placements: ["lucky-app-wall"] })
    ).toBe(true);
  });

  test("does not pay when the request did not ask for the surface", () => {
    expect(
      canPayOnTap({ surface: "lucky-app-wall", placements: ["news-click-ads"] })
    ).toBe(false);
  });

  test("does not pay on a non-earn surface", () => {
    expect(
      canPayOnTap({ surface: "news-click-ads", placements: ["news-click-ads"] })
    ).toBe(false);
  });

  test("does not pay on a Boost surface", () => {
    expect(
      canPayOnTap({
        surface: "connect-brand-video",
        placements: ["connect-brand-video"],
      })
    ).toBe(false);
  });

  test("without a surface, pays if any requested placement is an offer placement", () => {
    expect(
      canPayOnTap({
        surface: undefined,
        placements: ["points-mall-apps", "news-click-ads"],
      })
    ).toBe(true);
    expect(
      canPayOnTap({ surface: undefined, placements: ["news-click-ads"] })
    ).toBe(false);
  });
});
