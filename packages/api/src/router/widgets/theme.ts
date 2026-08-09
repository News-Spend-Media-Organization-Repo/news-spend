/**
 * Widget palette.
 *
 * Widgets paint their own SURFACE rather than inheriting the system container.
 * `createWidgetUpdateHandler` only passes `widgetId`, `family` and `platform` —
 * there is no `colorScheme` — so a server-rendered widget cannot adapt to light
 * or dark. Relying on the system background meant white text landed on a white
 * card in light mode and the whole widget read as blank.
 */
export const widgetTheme = {
  /** Painted behind every widget so text contrast is deterministic. */
  surface: "#0E1B2A",
  hairline: "#24354A",

  textPrimary: "#FFFFFF",
  /** Secondary headlines — steps back from the lead without dropping legibility. */
  textSecondary: "#C9D1DC",
  textMuted: "#8A94A6",

  /** One accent per widget, so the two are distinguishable at a glance. */
  accentTrending: "#FF6B35",
  accentDigest: "#4A90D9",
} as const;
