import { Linking } from "react-native";

import { openStoreLink, toMarketUrl } from "#/utils/openStoreLink";

const PLAY =
  "https://play.google.com/store/apps/details?id=com.ogwugo.ogwugofood&hl=en&clickId=clk_1";

describe("toMarketUrl", () => {
  it("turns a Play Store link into the store's own scheme, keeping the query", () => {
    expect(toMarketUrl(PLAY)).toBe(
      "market://details?id=com.ogwugo.ogwugofood&hl=en&clickId=clk_1"
    );
  });

  it("leaves other links alone", () => {
    expect(toMarketUrl("https://apps.apple.com/app/id123")).toBeNull();
    expect(toMarketUrl("not a url")).toBeNull();
  });
});

describe("openStoreLink", () => {
  const openURL = jest.spyOn(Linking, "openURL");
  beforeEach(() => openURL.mockReset());

  it("opens the link as given when that works", async () => {
    openURL.mockResolvedValue(undefined);
    await expect(openStoreLink(PLAY)).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith(PLAY);
  });

  it("tries the market scheme when the https link is refused", async () => {
    openURL
      .mockRejectedValueOnce(new Error("Permission Denial"))
      .mockResolvedValueOnce(undefined);
    await expect(openStoreLink(PLAY)).resolves.toBe(true);
    expect(openURL).toHaveBeenLastCalledWith(
      "market://details?id=com.ogwugo.ogwugofood&hl=en&clickId=clk_1"
    );
  });

  it("reports failure instead of throwing when nothing opens", async () => {
    openURL.mockRejectedValue(new Error("Permission Denial"));
    await expect(openStoreLink(PLAY)).resolves.toBe(false);
  });
});
