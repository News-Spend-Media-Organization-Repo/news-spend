import type { DocumentTabConfig } from "payload";

import { scopeOfRequest } from "./access";

const PATH = "@news-spend-media/payload/components/Analytics";

/**
 * The Stats tab on an article. Shown to staff only; the view checks again,
 * because a tab that is not shown is still reachable by its address.
 */
export const articleStatsView = {
  Component: `${PATH}#ArticleStatsView`,
  path: "/stats" as const,
  tab: {
    label: "Stats",
    href: "/stats",
    condition: ({ req }) => scopeOfRequest(req)?.kind === "staff",
  } satisfies DocumentTabConfig,
};

/** The Performance tab on a partner. Staff see any partner's; a partner their own. */
export const partnerPerformanceView = {
  Component: `${PATH}#PartnerPerformanceView`,
  path: "/performance" as const,
  tab: {
    label: "Performance",
    href: "/performance",
    condition: ({ req }) => scopeOfRequest(req) !== null,
  } satisfies DocumentTabConfig,
};

/**
 * The Stats tab on a giveaway. Shown to staff only; the view checks again,
 * because a tab that is not shown is still reachable by its address.
 */
export const giveawayStatsView = {
  Component: `${PATH}#GiveawayStatsView`,
  path: "/stats" as const,
  tab: {
    label: "Stats",
    href: "/stats",
    condition: ({ req }) => scopeOfRequest(req)?.kind === "staff",
  } satisfies DocumentTabConfig,
};

/** The full analytics page, reached from the sidebar. */
export const analyticsPageView = {
  Component: `${PATH}#AnalyticsPageView`,
  path: "/analytics" as const,
};

/** The Dream Points economy page, reached from the News | Points switch. */
export const pointsPageView = {
  Component: `${PATH}#PointsPageView`,
  path: "/analytics/points" as const,
};

export const analyticsNavLink = `${PATH}#AnalyticsNavLink`;
