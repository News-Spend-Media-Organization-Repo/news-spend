import type { NativeAd } from "react-native-google-mobile-ads";

import {
  clearTabAdCache,
  getCachedAd,
  isCachedAdStale,
  markTabAdsStale,
  registerAdSlots,
  setCachedAd,
} from "#/utils/ad-cache";

const fakeAd = () => ({ destroy: jest.fn() }) as unknown as NativeAd;

describe("ad cache slot keys", () => {
  beforeEach(() => {
    clearTabAdCache("latest");
    registerAdSlots("latest", []);
  });

  it("finds a loaded ad after the feed is rebuilt with new slot ids", () => {
    registerAdSlots("latest", ["gAd-a", "gAd-b"]);
    const ad = fakeAd();
    setCachedAd("latest", "gAd-a", ad);

    // The server composed the feed again: same slots, new random ids.
    registerAdSlots("latest", ["gAd-x", "gAd-y"]);

    expect(getCachedAd("latest", "gAd-x")).toBe(ad);
    expect(getCachedAd("latest", "gAd-y")).toBeNull();
  });

  it("keeps a stale ad showing until its replacement arrives", () => {
    jest.useFakeTimers();
    registerAdSlots("latest", ["gAd-a"]);
    const old = fakeAd();
    setCachedAd("latest", "gAd-a", old);

    markTabAdsStale("latest");

    expect(getCachedAd("latest", "gAd-a")).toBe(old);
    expect(isCachedAdStale("latest", "gAd-a")).toBe(true);

    const fresh = fakeAd();
    setCachedAd("latest", "gAd-a", fresh);

    expect(getCachedAd("latest", "gAd-a")).toBe(fresh);
    expect(isCachedAdStale("latest", "gAd-a")).toBe(false);
    // The old ad is released after the row has had time to repaint, not at once.
    expect(old.destroy as jest.Mock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(old.destroy as jest.Mock).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
