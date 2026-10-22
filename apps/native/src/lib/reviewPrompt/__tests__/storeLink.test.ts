import { Platform } from "react-native";

const mockOpenStoreLink = jest.fn();

jest.mock("#/utils/openStoreLink", () => ({
  openStoreLink: (...args: unknown[]) => mockOpenStoreLink(...args),
}));

const load = () => {
  let mod!: typeof import("../storeLink");
  jest.isolateModules(() => {
    mod = require("../storeLink");
  });
  return mod;
};

const setPlatform = (os: "ios" | "android") => {
  Object.defineProperty(Platform, "OS", { configurable: true, value: os });
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("openStoreReviewPage", () => {
  it("opens the App Store write-review page on iOS", async () => {
    setPlatform("ios");
    mockOpenStoreLink.mockResolvedValue(true);
    const { openStoreReviewPage } = load();

    await expect(openStoreReviewPage()).resolves.toBe(true);

    expect(mockOpenStoreLink).toHaveBeenCalledTimes(1);
    expect(mockOpenStoreLink).toHaveBeenCalledWith(
      "https://apps.apple.com/app/id6776046600?action=write-review"
    );
  });

  it("opens the Play listing through the market scheme on Android", async () => {
    setPlatform("android");
    mockOpenStoreLink.mockResolvedValue(true);
    const { openStoreReviewPage } = load();

    await expect(openStoreReviewPage()).resolves.toBe(true);

    expect(mockOpenStoreLink).toHaveBeenCalledWith(
      "market://details?id=com.newsspend.app"
    );
  });

  it("falls back to the web listing on Android when the market link fails", async () => {
    setPlatform("android");
    mockOpenStoreLink.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { openStoreReviewPage } = load();

    await expect(openStoreReviewPage()).resolves.toBe(true);

    expect(mockOpenStoreLink).toHaveBeenNthCalledWith(
      2,
      "https://play.google.com/store/apps/details?id=com.newsspend.app"
    );
  });

  it("returns false when nothing opens", async () => {
    setPlatform("android");
    mockOpenStoreLink.mockResolvedValue(false);
    const { openStoreReviewPage } = load();

    await expect(openStoreReviewPage()).resolves.toBe(false);
  });
});
