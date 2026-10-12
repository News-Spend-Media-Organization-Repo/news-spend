/**
 * URL normalisation for links minted before detail screens moved to the root
 * stack. Those carry a tab segment (`news/article/<slug>`); the canonical paths
 * no longer include it, so strip it.
 *
 * This cannot be sunset on a hunch. It was removed once on the reasoning that
 * the old form had expired, and shared links of the shape
 * `link.newsspend.com/news/article/<slug>` immediately began landing on
 * "Page not found" — whatever mints those still emits the tab segment. Nothing
 * in the test suite covered it, which is why the removal went unnoticed;
 * `legacy-tab-prefix.test.ts` is that coverage.
 *
 * It lives in its own module, apart from the linking config, so those tests can
 * import it without pulling in the native Detour module.
 */

const LEGACY_TAB_PREFIXES = new Set(["news", "shop", "discover", "settings"]);

/** First path segments of root-level detail screens. */
const DETAIL_LEADS = new Set([
  "article",
  "detail",
  "profile",
  "activities",
  "blocked-users",
  "report",
  "notification",
  "data-manager",
  "delete-account",
  "rate-app",
  "share-app",
  "socials",
  "support",
  "identity-verification",
  "advertise",
  "call",
  "feedback",
  "faq",
  "email",
  "legal",
  "terms-of-use",
  "privacy-policy",
  "community-guidelines",
  "play-lottery",
  "buy-ticket",
  "boost-luck",
  "lucky-app-wall",
  "my-prizes",
  "claim-prize",
  "prize",
  "lottery-rules",
  "browser",
  "survey",
  "games",
]);

export function stripLegacyTabPrefix(url: string): string {
  const strip = (segments: string[]): string[] => {
    if (
      segments.length >= 2 &&
      LEGACY_TAB_PREFIXES.has(segments[0] ?? "") &&
      DETAIL_LEADS.has(segments[1] ?? "")
    ) {
      return segments.slice(1);
    }
    return segments;
  };

  try {
    const parsed = new URL(url);
    // Scheme URLs put the tab segment in the hostname
    // (`news-spend://news/article/x`).
    if (
      LEGACY_TAB_PREFIXES.has(parsed.hostname) &&
      DETAIL_LEADS.has(parsed.pathname.split("/").filter(Boolean)[0] ?? "")
    ) {
      return `${parsed.protocol}//${parsed.pathname
        .split("/")
        .filter(Boolean)
        .join("/")}${parsed.search}${parsed.hash}`;
    }
    const segments = parsed.pathname.split("/").filter(Boolean);
    const stripped = strip(segments);
    if (stripped.length === segments.length) {
      return url;
    }
    parsed.pathname = `/${stripped.join("/")}`;
    return parsed.toString();
  } catch {
    return strip(url.split("/").filter(Boolean)).join("/") || url;
  }
}
