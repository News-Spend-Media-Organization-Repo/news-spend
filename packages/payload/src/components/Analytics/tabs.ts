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
  // Payload matches a view without `exact` as a prefix, and takes the first
  // one that matches, so /analytics would answer for /analytics/points too.
  exact: true as const,
};

/** The Dream Points economy page, reached from the News | Points switch. */
export const pointsPageView = {
  Component: `${PATH}#PointsPageView`,
  path: "/analytics/points" as const,
  exact: true as const,
};

/** Activation and device retention, from the News | Points | Retention switch. */
export const retentionPageView = {
  Component: `${PATH}#RetentionPageView`,
  path: "/analytics/retention" as const,
  exact: true as const,
};

/** Survey provider performance, reached from the sidebar. */
export const surveyPerformanceView = {
  Component: `${PATH}#SurveyPerformanceView`,
  path: "/survey-performance" as const,
  exact: true as const,
};

/** The admin's custom pages, as `admin.components.views` registers them. */
export const analyticsViews = {
  analytics: analyticsPageView,
  analyticsPoints: pointsPageView,
  analyticsRetention: retentionPageView,
  surveyPerformance: surveyPerformanceView,
};

export const analyticsNavLink = `${PATH}#AnalyticsNavLink`;
export const surveyPerformanceNavLink = `${PATH}#SurveyNavLink`;
