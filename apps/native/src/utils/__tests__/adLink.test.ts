import { resolvePartnerLink } from "../adLink";

describe("resolvePartnerLink", () => {
  const links = {
    iosAppStore: "https://apps.apple.com/app/id1",
    androidPlayStore: "https://play.google.com/store/apps/details?id=x",
    website: "https://advertiser.example/offer",
  };

  it("prefers the store link for the platform", () => {
    expect(resolvePartnerLink(links, "ios")).toEqual({
      url: "https://apps.apple.com/app/id1",
      isStore: true,
    });
    expect(resolvePartnerLink(links, "android")).toEqual({
      url: "https://play.google.com/store/apps/details?id=x",
      isStore: true,
    });
  });

  it("falls back to the website and marks it as not a store", () => {
    expect(resolvePartnerLink({ website: links.website }, "ios")).toEqual({
      url: "https://advertiser.example/offer",
      isStore: false,
    });
  });

  it("skips blank fields instead of opening an empty URL", () => {
    expect(
      resolvePartnerLink(
        { iosAppStore: "  ", website: " https://a.example " },
        "ios"
      )
    ).toEqual({ url: "https://a.example", isStore: false });
  });

  it("returns null when nothing is usable", () => {
    expect(resolvePartnerLink({}, "ios")).toBeNull();
    expect(resolvePartnerLink(null, "ios")).toBeNull();
  });
});
