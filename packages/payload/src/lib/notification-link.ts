import {
  APP_PATH_FAMILIES,
  APP_SCREENS,
} from "@news-spend-media/utils/appRoutes";

/**
 * Admin campaigns route by `data.url`: a path inside the app, not a web URL.
 * The destinations live in `@news-spend-media/utils/appRoutes`, shared with
 * the app's own parity test.
 */

export type NotificationDestination =
  | { target: "article"; articleId?: string; articleSlug?: string }
  | { target: "screen"; screen?: string }
  | { target: "web"; url?: string };

const SCREENS = new Set(APP_SCREENS.map(({ value }) => value));

const SHARE_ORIGIN = /^https?:\/\/link\.newsspend\.com\/?/i;
const LEADING_SLASHES = /^\/+/;
const LEGACY_NEWS_PREFIX = /^news\/(?=article\/)/;

/** `article/<slug>` and nothing deeper: thread links are not picker values. */
const ARTICLE_PATH = /^article\/([^/?#]+)\/?$/;

/** `browser?url=` / `survey?url=` — the WebView screen carrying its address. */
const WEB_DESTINATION = /^(?:browser|survey)\?(.*)$/;

/** Paths that load a WebView and are useless without a `?url=` param. */
const WEB_SCREENS = new Set(["browser", "survey"]);

function isHttpUrl(value: string | null): boolean {
  if (!value) {
    return false;
  }

  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The canonical app path for a `data.url`, or null when there is nothing to
 * route to. Share links and the pre-refactor tab-prefixed form are folded into
 * the shape the app's router declares.
 */
export function normaliseNotificationPath(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const path = raw
    .trim()
    .replace(SHARE_ORIGIN, "")
    .replace(LEADING_SLASHES, "")
    // `news/article/<slug>` is the form older links and share sheets minted.
    .replace(LEGACY_NEWS_PREFIX, "");

  return path || null;
}

export function isRoutableNotificationPath(path: string): boolean {
  const [pathname = "", ...query] = path.split("?");
  const search = new URLSearchParams(query.join("?"));

  if (WEB_SCREENS.has(pathname)) {
    return isHttpUrl(search.get("url"));
  }

  return (
    SCREENS.has(pathname) ||
    APP_PATH_FAMILIES.some((prefix) => pathname.startsWith(prefix))
  );
}

/**
 * The destination an operator's or producer's `data` resolves to.
 *
 * - `{ url }` — route the tap there.
 * - `{ error }` — publish must be refused: the admin forgot a destination, or
 *   wrote one the app cannot open.
 * - `null` — an explicit `url: null`. Producers use it when they could not
 *   resolve a target (a comment whose article was gone); the push still goes
 *   out and just opens no screen, the behaviour it had before validation.
 */
export function resolveNotificationUrl(
  payloadData: Record<string, unknown>
): { url: string } | { error: "missing" | "unroutable" } | null {
  if (!("url" in payloadData)) {
    return { error: "missing" };
  }

  if (payloadData.url === null) {
    return null;
  }

  const url = normaliseNotificationPath(payloadData.url);

  if (!(url && isRoutableNotificationPath(url))) {
    return { error: "unroutable" };
  }

  return { url };
}

/**
 * What the destination picker should show for a stored `data` value.
 *
 * Undefined means the link was not made in the picker — a comment thread, a
 * prize, or nothing at all. The component leaves those untouched unless the
 * admin chooses a new destination.
 */
export function parseNotificationDestination(
  data: unknown
): NotificationDestination | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return;
  }

  const { url, newsId } = data as Record<string, unknown>;

  if (typeof url !== "string") {
    return;
  }

  if (SCREENS.has(url)) {
    return { target: "screen", screen: url };
  }

  const web = WEB_DESTINATION.exec(url);
  if (web) {
    const target = new URLSearchParams(web[1]).get("url");
    return { target: "web", url: target ?? undefined };
  }

  const article = ARTICLE_PATH.exec(url);
  if (!article) {
    return;
  }

  return {
    target: "article",
    articleId: typeof newsId === "string" && newsId ? newsId : undefined,
    articleSlug: article[1],
  };
}

/** `data` for an article destination, keeping any other keys on it. */
export function withArticleDestination(
  data: Record<string, unknown>,
  article: { id: string; slug: string }
): Record<string, unknown> {
  return {
    ...data,
    url: `article/${article.slug}`,
    newsId: article.id,
    type: "news",
  };
}

/** `data` for a screen destination, keeping any other keys on it. */
export function withScreenDestination(
  data: Record<string, unknown>,
  screen: string
): Record<string, unknown> {
  const next = { ...data };
  next.newsId = undefined;
  return { ...next, url: screen };
}

/** `data` for a web page: the WebView screen with its `url` param. */
export function withWebDestination(
  data: Record<string, unknown>,
  url: string
): Record<string, unknown> {
  const next = { ...data };
  next.newsId = undefined;
  return { ...next, url: `browser?url=${encodeURIComponent(url.trim())}` };
}
