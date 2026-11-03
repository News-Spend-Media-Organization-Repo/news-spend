/**
 * The path each tab root answers to. Declared apart from the navigator so the
 * notification-destination parity test can read them without pulling the whole
 * screen tree into a test.
 */
export const TAB_PATHS = {
  Home: "news",
  Discover: "discover",
  Shop: "shop",
  Me: "settings",
} as const;
