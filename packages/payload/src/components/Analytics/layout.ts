import type { Field, PayloadRequest, Widget, WidgetInstance } from "payload";

import type {
  AnalyticsAudienceKpiWidget,
  AnalyticsKpiWidget,
} from "../../payload-types";
import { scopeOfRequest } from "./access";

const PATH = "@news-spend-media/payload/components/Analytics";

const daysField: Field = {
  name: "days",
  type: "select",
  label: "Period",
  defaultValue: "30",
  options: [
    { label: "7 days", value: "7" },
    { label: "30 days", value: "30" },
    { label: "90 days", value: "90" },
  ],
};

const metricField: Field = {
  name: "metric",
  type: "select",
  label: "Metric",
  defaultValue: "views",
  options: [
    { label: "Views", value: "views" },
    { label: "Qualified reads", value: "reads" },
    { label: "Impressions", value: "impressions" },
    { label: "Readers", value: "readers" },
    { label: "Shares", value: "shares" },
    { label: "Click-through", value: "ctr" },
    { label: "Read rate", value: "readRate" },
  ],
};

const audienceMetricField: Field = {
  name: "metric",
  type: "select",
  label: "Metric",
  defaultValue: "registered",
  options: [
    { label: "Registered", value: "registered" },
    { label: "New accounts", value: "newUsers" },
    { label: "Active, 7 days", value: "active7" },
    { label: "Active, 30 days", value: "active30" },
    { label: "Email verified", value: "emailVerifiedRate" },
    { label: "Push enabled", value: "pushRate" },
    { label: "Guests now", value: "guests" },
  ],
};

/**
 * Slugs are permanent. A saved dashboard refers to a widget by slug, so a
 * renamed one leaves a "not found" box on everyone's layout that had it.
 */
export const analyticsWidgets: Widget[] = [
  {
    slug: "analytics-kpi",
    label: "Key figure",
    Component: `${PATH}#KpiWidget`,
    fields: [metricField, daysField],
    minWidth: "x-small",
    maxWidth: "medium",
  },
  {
    slug: "analytics-funnel",
    label: "Reader funnel",
    Component: `${PATH}#FunnelWidget`,
    fields: [daysField],
    minWidth: "medium",
  },
  {
    slug: "analytics-top-articles",
    label: "Top articles",
    Component: `${PATH}#TopArticlesWidget`,
    fields: [daysField],
    minWidth: "medium",
  },
  {
    slug: "analytics-surfaces",
    label: "Impressions by surface",
    Component: `${PATH}#SurfacesWidget`,
    fields: [daysField],
    minWidth: "small",
    maxWidth: "medium",
  },
  {
    slug: "analytics-categories",
    label: "Top categories",
    Component: `${PATH}#CategoriesWidget`,
    fields: [daysField],
    minWidth: "small",
    maxWidth: "medium",
  },
  {
    slug: "analytics-partner-performance",
    label: "Partner performance",
    Component: `${PATH}#PartnerPerformanceWidget`,
    fields: [daysField],
    minWidth: "medium",
  },
  {
    slug: "analytics-audience-kpi",
    label: "Audience figure",
    Component: `${PATH}#AudienceKpiWidget`,
    fields: [audienceMetricField, daysField],
    minWidth: "x-small",
    maxWidth: "medium",
  },
  {
    slug: "analytics-audience-growth",
    label: "Audience growth",
    Component: `${PATH}#GrowthWidget`,
    fields: [daysField],
    minWidth: "medium",
  },
  {
    slug: "analytics-devices",
    label: "Devices",
    Component: `${PATH}#DevicesWidget`,
    minWidth: "small",
    maxWidth: "medium",
  },
  {
    slug: "analytics-countries",
    label: "Top countries",
    Component: `${PATH}#CountriesWidget`,
    minWidth: "small",
    maxWidth: "medium",
  },
  {
    slug: "analytics-feedback",
    label: "Feedback",
    Component: `${PATH}#FeedbackWidget`,
    fields: [daysField],
    minWidth: "small",
    maxWidth: "medium",
  },
  {
    slug: "analytics-attention",
    label: "Needs attention",
    Component: `${PATH}#AttentionWidget`,
    minWidth: "medium",
  },
  {
    slug: "analytics-push",
    label: "Push campaigns",
    Component: `${PATH}#PushWidget`,
    fields: [daysField],
    minWidth: "medium",
  },
];

type KpiMetric = NonNullable<NonNullable<AnalyticsKpiWidget["data"]>["metric"]>;

type AudienceKpiMetric = NonNullable<
  NonNullable<AnalyticsAudienceKpiWidget["data"]>["metric"]
>;

const kpi = (metric: KpiMetric): WidgetInstance => ({
  widgetSlug: "analytics-kpi",
  width: "x-small",
  data: { metric, days: "30" },
});

const audienceKpi = (metric: AudienceKpiMetric): WidgetInstance => ({
  widgetSlug: "analytics-audience-kpi",
  width: "x-small",
  data: { metric, days: "30" },
});

/**
 * What a user's home page starts as, until they rearrange it. Staff get the
 * newsroom overview; a partner gets their own performance and nothing else;
 * anyone else gets an empty page.
 *
 * Only a starting point: a saved layout wins over this, and any widget can be
 * added by hand, which is why each widget checks access itself.
 */
export function analyticsDefaultLayout({
  req,
}: {
  req: PayloadRequest;
}): WidgetInstance[] {
  const scope = scopeOfRequest(req);

  if (scope?.kind === "partner") {
    return [
      {
        widgetSlug: "analytics-partner-performance",
        width: "full",
        data: { days: "30" },
      },
    ];
  }
  if (scope?.kind === "staff") {
    return [
      kpi("views"),
      kpi("reads"),
      kpi("ctr"),
      kpi("readers"),
      { widgetSlug: "analytics-funnel", width: "large", data: { days: "30" } },
      {
        widgetSlug: "analytics-surfaces",
        width: "small",
        data: { days: "30" },
      },
      {
        widgetSlug: "analytics-top-articles",
        width: "medium",
        data: { days: "30" },
      },
      {
        widgetSlug: "analytics-partner-performance",
        width: "medium",
        data: { days: "30" },
      },
      audienceKpi("registered"),
      audienceKpi("active7"),
      audienceKpi("pushRate"),
      {
        widgetSlug: "analytics-audience-growth",
        width: "large",
        data: { days: "30" },
      },
      { widgetSlug: "analytics-devices", width: "small" },
      { widgetSlug: "collections", width: "full" },
    ];
  }
  return [];
}
