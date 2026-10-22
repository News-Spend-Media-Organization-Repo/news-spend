/**
 * URL normalisation for links minted before detail screens moved to the root
 * stack. Those carry a tab segment (`news/article/<slug>`); the canonical paths
 * no longer include it, so strip it.
 *
 * This cannot be sunset on a hunch. It was removed once on the reasoning that
 * the old form had expired, and shared links of the shape
 * `link.newsspend.com/news/article/<slug>` immediately began landing on
 * "Page not found" — whatever mints those still emitted the tab segment. Nothing
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

export type LegacyTabNormalization = {
  /** The URL to navigate to: the input, minus any legacy tab segment. */
  url: string;
  /**
   * The tab segment that was removed, or `null` when this URL needed no
   * rewrite. Callers report on it: whether these still arrive — and from where
   * — is the only thing that says when this module can be deleted.
   */
  tab: string | null;
};

export function normalizeLegacyTabPrefix(url: string): LegacyTabNormalization {
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
    const segments = parsed.pathname.split("/").filter(Boolean);
    // Scheme URLs put the tab segment in the hostname
    // (`news-spend://news/article/x`).
    if (
      LEGACY_TAB_PREFIXES.has(parsed.hostname) &&
      DETAIL_LEADS.has(segments[0] ?? "")
    ) {
      return {
        url: `${parsed.protocol}//${segments.join("/")}${parsed.search}${parsed.hash}`,
        tab: parsed.hostname,
      };
    }
    const stripped = strip(segments);
    if (stripped.length === segments.length) {
      return { url, tab: null };
    }
    parsed.pathname = `/${stripped.join("/")}`;
    return { url: parsed.toString(), tab: segments[0] ?? null };
  } catch {
    // No scheme — a bare path like `news/article/<slug>`.
    const segments = url.split("/").filter(Boolean);
    const stripped = strip(segments);
    if (stripped.length === segments.length) {
      return { url, tab: null };
    }
    return { url: stripped.join("/") || url, tab: segments[0] ?? null };
  }
}
