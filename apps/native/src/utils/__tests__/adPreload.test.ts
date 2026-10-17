import { ensureNativeAdLoaded } from "#/utils/ad-loader";
import { AD_LOOKAHEAD_ROWS, preloadAdsAhead } from "#/utils/ad-preload";

jest.mock("#/utils/ad-loader", () => ({ ensureNativeAdLoaded: jest.fn() }));

const article = (id: string) => ({ _type: "article", type: "article", id });
const ad = (id: string) => ({ _type: "ad", type: "gAd", id });

describe("preloadAdsAhead", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requests only the ads within the lookahead, not the whole feed", () => {
    const rows = Array.from({ length: 60 }, (_, i) =>
      i % 5 === 4 ? ad(`ad-${i}`) : article(`a-${i}`)
    );

    preloadAdsAhead("latest", rows, 0);

    const loaded = (ensureNativeAdLoaded as jest.Mock).mock.calls.map(
      (call) => call[1]
    );
    expect(loaded).toEqual(["ad-4", "ad-9"]);
    expect(loaded).not.toContain("ad-59");
  });

  it("reaches further down as the reader scrolls", () => {
    const rows = Array.from({ length: 60 }, (_, i) =>
      i % 5 === 4 ? ad(`ad-${i}`) : article(`a-${i}`)
    );

    preloadAdsAhead("latest", rows, 30);

    const loaded = (ensureNativeAdLoaded as jest.Mock).mock.calls.map(
      (call) => call[1]
    );
    expect(loaded).toContain(
      `ad-${30 + AD_LOOKAHEAD_ROWS - ((30 + AD_LOOKAHEAD_ROWS) % 5) - 1}`
    );
    expect(loaded).toContain("ad-39");
  });

  it("ignores missing data and non-Google ad rows", () => {
    preloadAdsAhead("latest", undefined, 0);
    preloadAdsAhead(
      "latest",
      [{ _type: "ad", type: "inHouse", id: "x" }, null],
      0
    );

    expect(ensureNativeAdLoaded).not.toHaveBeenCalled();
  });
});
