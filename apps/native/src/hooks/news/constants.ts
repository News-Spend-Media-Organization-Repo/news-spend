/** Shared across every news feed tab (Latest + each category). */
export const NEWS_FEED_STALE_TIME_MS = 60 * 1000;

/**
 * How often an on-screen feed quietly re-checks for new posts.
 *
 * The feed used to have no interval at all: the only triggers were app
 * foreground and returning to the tab, so a user who left the app sitting on
 * the feed could watch a story get published and never see it appear. The
 * owner reported this as "news does not auto refresh like before".
 *
 * A minute is deliberate. It is well inside the server's feed-cache TTL, so a
 * poll only reaches the database when that cache has already expired, and it is
 * short enough that a post lands while someone is still looking at the screen.
 */
export const NEWS_FEED_REFETCH_INTERVAL_MS = 60 * 1000;
