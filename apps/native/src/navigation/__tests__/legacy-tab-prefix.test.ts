import { stripLegacyTabPrefix } from "../legacy-tab-prefix";

/**
 * The URL normalisation that runs before the linking config ever sees a path.
 *
 * These are the cases whose absence let the shim be deleted without a test
 * noticing, and a shared link start landing on "Page not found" in production.
 */
describe("stripLegacyTabPrefix", () => {
  it.each([
    // The live shape: what link.newsspend.com actually serves.
    ["news/article/some-slug", "article/some-slug"],
    ["shop/detail/some-slug", "detail/some-slug"],
    ["settings/profile", "profile"],
    ["discover/my-prizes", "my-prizes"],
    // Scheme URLs carry the tab segment in the hostname.
    ["news-spend://news/article/some-slug", "news-spend://article/some-slug"],
    ["news-spend://shop/detail/some-slug", "news-spend://detail/some-slug"],
  ])("%s -> %s", (input, expected) => {
    expect(stripLegacyTabPrefix(input)).toBe(expected);
  });

  it.each([
    "article/some-slug",
    "article/some-slug/comment/c1",
    "no/such/path",
    // A tab segment not followed by a detail screen is a real route.
    "news/something-else",
    "settings/something-else",
  ])("leaves %s alone", (input) => {
    expect(stripLegacyTabPrefix(input)).toBe(input);
  });

  it("keeps a query string", () => {
    expect(stripLegacyTabPrefix("news/article/some-slug?newsId=1")).toBe(
      "article/some-slug?newsId=1"
    );
  });

  it("keeps a hash", () => {
    expect(
      stripLegacyTabPrefix("https://link.newsspend.com/news/article/x#c1")
    ).toBe("https://link.newsspend.com/article/x#c1");
  });

  it("handles the full link.newsspend.com URL from the report", () => {
    expect(
      stripLegacyTabPrefix(
        "https://link.newsspend.com/news/article/breaking-12-killed-over-300-injured-in-riyadh-airport-attack-saudi-authorities-say"
      )
    ).toBe(
      "https://link.newsspend.com/article/breaking-12-killed-over-300-injured-in-riyadh-airport-attack-saudi-authorities-say"
    );
  });
});
