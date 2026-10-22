import { describe, expect, it } from "bun:test";

import { shapeForPlacements } from "./shapeForPlacements";

const doc = {
  id: "pc1",
  condition: "Install and reach level 5",
  points: 500,
  adCopy: "Try the app",
  description: "A fun app",
};

describe("shapeForPlacements", () => {
  it("returns the doc unchanged for an earn request", () => {
    const result = shapeForPlacements(doc, ["points-mall-apps"]);
    expect(result).toBe(doc);
  });

  it("replaces condition with adCopy for an ad request", () => {
    const result = shapeForPlacements(doc, ["news-click-ads"]);
    expect(result.condition).toBe("Try the app");
  });

  it("falls back to description when adCopy is empty", () => {
    const result = shapeForPlacements({ ...doc, adCopy: "" }, [
      "news-click-ads",
    ]);
    expect(result.condition).toBe("A fun app");
  });

  it("gives an empty string, never the stored condition, when both are empty", () => {
    const result = shapeForPlacements(
      { ...doc, adCopy: null, description: undefined },
      ["news-click-ads"]
    );
    expect(result.condition).toBe("");
  });

  it("removes points from an ad-shaped result", () => {
    const result = shapeForPlacements(doc, ["news-click-ads"]);
    expect("points" in result).toBe(false);
  });

  it("does not mutate the input doc", () => {
    shapeForPlacements(doc, ["news-click-ads"]);
    expect(doc.points).toBe(500);
    expect(doc.condition).toBe("Install and reach level 5");
  });

  it("treats a mixed request as ad-shaped", () => {
    const result = shapeForPlacements(doc, [
      "points-mall-apps",
      "news-click-ads",
    ]);
    expect(result.condition).toBe("Try the app");
    expect("points" in result).toBe(false);
  });

  it("treats undefined placements as ad-shaped", () => {
    const result = shapeForPlacements(doc, undefined);
    expect(result.condition).toBe("Try the app");
    expect("points" in result).toBe(false);
  });
});
