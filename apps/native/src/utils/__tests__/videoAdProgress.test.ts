import { videoEventsAt } from "../videoAdProgress";

describe("videoEventsAt", () => {
  it("crosses 25, 50 and 75 once", () => {
    expect(videoEventsAt(1.3, 5, new Set(), 0.5)).toEqual(["video_25"]);
    expect(videoEventsAt(3.6, 5, new Set(["video_25"]), 0.5)).toEqual([
      "video_50",
    ]);
    expect(
      videoEventsAt(3.8, 5, new Set(["video_25", "video_50"]), 0.5)
    ).toEqual(["video_75"]);
  });

  it("completes a 5s ad at the last sample before the loop wraps", () => {
    expect(
      videoEventsAt(4.5, 5, new Set(["video_25", "video_50", "video_75"]), 0.5)
    ).toEqual(["video_complete"]);
  });

  it("completes a 15s ad at 14.5", () => {
    expect(videoEventsAt(14.5, 15, new Set(), 0.5)).toEqual([
      "video_25",
      "video_50",
      "video_75",
      "video_complete",
    ]);
  });

  it("does not repeat fired events after the loop restarts", () => {
    const fired = new Set([
      "video_25",
      "video_50",
      "video_75",
      "video_complete",
    ] as const);
    expect(videoEventsAt(0.2, 5, fired, 0.5)).toEqual([]);
  });

  it("returns nothing before the duration is known", () => {
    expect(videoEventsAt(0, 0, new Set(), 0.5)).toEqual([]);
  });
});
