import { resolveAdSurface } from "../adSurface";

const REQUESTED = ["connect-brands-tab", "connect-brand-video"] as const;

describe("resolveAdSurface", () => {
  it("keeps the preferred surface when the item lists it", () => {
    expect(
      resolveAdSurface(
        { placements: ["connect-brand-video"] },
        "connect-brand-video",
        [...REQUESTED]
      )
    ).toBe("connect-brand-video");
  });

  it("falls back to a placement the item does list", () => {
    expect(
      resolveAdSurface(
        { placements: ["connect-brands-tab"] },
        "connect-brand-video",
        [...REQUESTED]
      )
    ).toBe("connect-brands-tab");
  });

  it("falls back to the preferred surface when the item lists neither", () => {
    expect(
      resolveAdSurface({ placements: [] }, "connect-brand-video", [
        ...REQUESTED,
      ])
    ).toBe("connect-brand-video");
  });
});
