import { describe, expect, it } from "bun:test";

import { sanitizeEventMetadata } from "./eventMetadata";

describe("sanitizeEventMetadata", () => {
  it("leaves real values exactly as they are", () => {
    const real = {
      position: 3,
      screen: "HomeFeed",
      timeSpent: 94,
      scrollDepth: 0.87,
      shareMethod: "whatsapp",
    };

    expect(sanitizeEventMetadata(real)).toEqual(real);
  });

  it("does not alter a build that sent scroll depth as a percentage", () => {
    expect(sanitizeEventMetadata({ scrollDepth: 87 })).toEqual({
      scrollDepth: 87,
    });
  });

  it("is an empty object for nothing", () => {
    expect(sanitizeEventMetadata(undefined)).toEqual({});
    expect(sanitizeEventMetadata({})).toEqual({});
  });

  it("holds absurd numbers to the nearest bound", () => {
    expect(
      sanitizeEventMetadata({
        position: 9_999_999,
        timeSpent: 1e12,
        scrollDepth: 1e9,
      })
    ).toEqual({ position: 1000, timeSpent: 86_400, scrollDepth: 100 });
  });

  it("holds negative numbers to zero", () => {
    expect(
      sanitizeEventMetadata({ position: -5, timeSpent: -1, scrollDepth: -0.5 })
    ).toEqual({ position: 0, timeSpent: 0, scrollDepth: 0 });
  });

  it("rounds a position to a whole rank", () => {
    expect(sanitizeEventMetadata({ position: 2.6 })).toEqual({ position: 3 });
  });

  it("leaves out numbers that are not numbers", () => {
    expect(
      sanitizeEventMetadata({
        timeSpent: Number.NaN,
        scrollDepth: Number.POSITIVE_INFINITY,
        position: "3" as never,
      })
    ).toEqual({});
  });

  it("cuts long labels and trims them", () => {
    const out = sanitizeEventMetadata({
      screen: `  ${"x".repeat(500)}  `,
      shareMethod: "  copy  ",
    });

    expect(out.screen).toBe("x".repeat(64));
    expect(out.shareMethod).toBe("copy");
  });

  it("leaves out labels that are empty or not text", () => {
    expect(
      sanitizeEventMetadata({ screen: "   ", shareMethod: 42 as never })
    ).toEqual({});
  });

  it("drops any key it does not know, so nothing else can be smuggled in", () => {
    const out = sanitizeEventMetadata({
      screen: "Article",
      evil: "x".repeat(1_000_000),
    } as never);

    expect(out).toEqual({ screen: "Article" });
  });
});
