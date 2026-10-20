import { describe, expect, it } from "bun:test";

import { partnerContentChecklist } from "../src/lib/partnerContentChecklist";

const check = (
  doc: Parameters<typeof partnerContentChecklist>[0],
  key: string
) => partnerContentChecklist(doc).find((c) => c.key === key);

describe("partnerContentChecklist", () => {
  it("returns exactly the three checks, each with a message", () => {
    const list = partnerContentChecklist({});
    expect(list.map((c) => c.key)).toEqual([
      "points-without-offer-placement",
      "offer-placement-without-points",
      "missing-ad-copy",
    ]);
    for (const c of list) {
      expect(c.message.length).toBeGreaterThan(0);
    }
  });

  it("fails points without an offer placement", () => {
    const bad = check(
      { points: 30, placements: ["news-click-ads"] },
      "points-without-offer-placement"
    );
    expect(bad?.ok).toBe(false);
    expect(bad?.message).toBe(
      "Points are set but no offer placement is selected; users will not be paid."
    );
    expect(
      check(
        { points: 30, placements: ["lucky-app-wall"] },
        "points-without-offer-placement"
      )?.ok
    ).toBe(true);
  });

  it("treats null placements as empty and null points as zero", () => {
    expect(
      check({ points: 5, placements: null }, "points-without-offer-placement")
        ?.ok
    ).toBe(false);
    expect(
      check(
        { points: null, placements: null },
        "points-without-offer-placement"
      )?.ok
    ).toBe(true);
    expect(
      check({ points: null, placements: [] }, "offer-placement-without-points")
        ?.ok
    ).toBe(true);
  });

  it("fails an offer placement with null or zero points", () => {
    for (const points of [null, 0, undefined]) {
      expect(
        check(
          { points, placements: ["points-mall-apps"] },
          "offer-placement-without-points"
        )?.ok
      ).toBe(false);
    }
    expect(
      check(
        { points: 10, placements: ["points-mall-apps"] },
        "offer-placement-without-points"
      )?.ok
    ).toBe(true);
  });

  it("requires ad copy only on active items", () => {
    expect(check({ status: "active" }, "missing-ad-copy")?.ok).toBe(false);
    expect(
      check({ status: "active", adCopy: "   " }, "missing-ad-copy")?.ok
    ).toBe(false);
    expect(
      check({ status: "active", adCopy: "Read now" }, "missing-ad-copy")?.ok
    ).toBe(true);
    expect(check({ status: "draft", adCopy: "" }, "missing-ad-copy")?.ok).toBe(
      true
    );
  });

  it("words the ad copy mark by whether it is required", () => {
    expect(
      check({ status: "draft", adCopy: "" }, "missing-ad-copy")?.message
    ).toBe("Ad copy is only required once the item is active.");
    expect(
      check({ status: "active", adCopy: "Read now" }, "missing-ad-copy")
        ?.message
    ).toBe("Ad copy is in place.");
  });
});
