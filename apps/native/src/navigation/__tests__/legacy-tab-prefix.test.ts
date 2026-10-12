import { normalizeLegacyTabPrefix } from "../legacy-tab-prefix";

/**
 * The URL normalisation that runs before the linking config ever sees a path.
 *
 * These are the cases whose absence let the shim be deleted without a test
 * noticing, and a shared link start landing on "Page not found" in production.
 * The `tab` assertion is the other half: it is what callers report, and the
 * only thing that will say when the shim can go.
 */
describe("normalizeLegacyTabPrefix", () => {
  it.each([
    // Stripped: the tab segment comes off, and is named for the report.
    ["news/article/some-slug", "article/some-slug", "news"],
    ["shop/detail/some-slug", "detail/some-slug", "shop"],
    ["settings/profile", "profile", "settings"],
    ["discover/my-prizes", "my-prizes", "discover"],
    // Scheme URLs carry the tab segment in the hostname.
    [
      "news-spend://news/article/some-slug",
      "news-spend://article/some-slug",
      "news",
    ],
    [
      "news-spend://shop/detail/some-slug",
      "news-spend://detail/some-slug",
      "shop",
    ],
    // Untouched. A tab segment not followed by a detail screen is a real route,
    // and a path that is already canonical must come back byte for byte.
    ["article/some-slug", "article/some-slug", null],
    ["article/some-slug/comment/c1", "article/some-slug/comment/c1", null],
    ["no/such/path", "no/such/path", null],
    ["news/something-else", "news/something-else", null],
    ["settings/something-else", "settings/something-else", null],
  ])("%s -> %s (tab: %s)", (input, expectedUrl, expectedTab) => {
    expect(normalizeLegacyTabPrefix(input)).toEqual({
      url: expectedUrl,
      tab: expectedTab,
    });
  });

  it("keeps a query string", () => {
    expect(normalizeLegacyTabPrefix("news/article/some-slug?newsId=1")).toEqual(
      {
        url: "article/some-slug?newsId=1",
        tab: "news",
      }
    );
  });

  it("keeps a hash", () => {
    expect(
      normalizeLegacyTabPrefix("https://link.newsspend.com/news/article/x#c1")
    ).toEqual({
      url: "https://link.newsspend.com/article/x#c1",
      tab: "news",
    });
  });

  it("handles the full link.newsspend.com URL from the report", () => {
    const slug =
      "breaking-12-killed-over-300-injured-in-riyadh-airport-attack-saudi-authorities-say";
    expect(
      normalizeLegacyTabPrefix(
        `https://link.newsspend.com/news/article/${slug}`
      )
    ).toEqual({
      url: `https://link.newsspend.com/article/${slug}`,
      tab: "news",
    });
  });
});
