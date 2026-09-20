import type {
  AudienceSummary,
  NewsMetrics,
  StaffScope,
} from "@news-spend-media/analytics";
import {
  AnalyticsAccessError,
  audienceCountries,
  audienceDaily,
  audienceDevices,
  audienceSummary,
  feedbackSummary,
  needsAttention,
  newsDaily,
  newsSummary,
  newsSurfaces,
  newsTopArticles,
  newsTopCategories,
  partnerRecentConversions,
  partnerSummary,
  pushReport,
  resolveRange,
} from "@news-spend-media/analytics";
import type { WidgetServerProps } from "payload";
import type { ReactNode } from "react";

import { ANALYTICS_TIME_ZONE, dbOf, scopeOfRequest } from "./access";
import {
  CategoriesPanel,
  CountriesPanel,
  DevicesPanel,
  FeedbackPanel,
  FunnelPanel,
  GrowthPanel,
  NeedsAttentionPanel,
  PartnerKpis,
  PushPanel,
  RecentConversionsPanel,
  SurfacesPanel,
  TopArticlesPanel,
} from "./blocks";
import { describeChange, formatCount, formatPercent } from "./format";
import { toDays } from "./params";
import { Denied, Kpi, Styles } from "./ui";

/**
 * Dashboard widgets.
 *
 * Payload renders whichever widget a signed-in user asks for, by name, and lets
 * anyone add any registered widget to their own dashboard. The default layout
 * is a suggestion, not a control, so every widget decides for itself whether
 * the viewer may see it, exactly as the pages and tabs do.
 */

type Data = { metric?: string; days?: string };

const dataOf = (props: WidgetServerProps): Data =>
  (props.widgetData ?? {}) as Data;

/** Runs a staff-only widget, or shows "no access" to anyone else. */
async function staffWidget(
  props: WidgetServerProps,
  render: (context: {
    scope: StaffScope;
    db: ReturnType<typeof dbOf>;
    range: ReturnType<typeof resolveRange>;
  }) => Promise<ReactNode>
): Promise<ReactNode> {
  const scope = scopeOfRequest(props.req);
  if (scope?.kind !== "staff") {
    return <Denied />;
  }
  const range = resolveRange({
    days: toDays(dataOf(props).days),
    timeZone: ANALYTICS_TIME_ZONE,
  });
  return (
    <>
      <Styles />
      <div className="ana">
        {await render({ scope, db: dbOf(props.req), range })}
      </div>
    </>
  );
}

type Metric = {
  label: string;
  value: (m: NewsMetrics) => number | null;
  format: (v: number | null) => string;
  /** Ratios are shown as they are; a percentage change of a percentage misleads. */
  compare: boolean;
};

const count = (v: number | null) => formatCount(v ?? 0);

export const KPI_METRICS: Record<string, Metric> = {
  views: {
    label: "Views",
    value: (m) => m.views,
    format: count,
    compare: true,
  },
  reads: {
    label: "Qualified reads",
    value: (m) => m.reads,
    format: count,
    compare: true,
  },
  impressions: {
    label: "Impressions",
    value: (m) => m.impressions,
    format: count,
    compare: true,
  },
  readers: {
    label: "Readers",
    value: (m) => m.readers,
    format: count,
    compare: true,
  },
  shares: {
    label: "Shares",
    value: (m) => m.shares,
    format: count,
    compare: true,
  },
  ctr: {
    label: "Click-through",
    value: (m) => m.ctr,
    format: formatPercent,
    compare: false,
  },
  readRate: {
    label: "Read rate",
    value: (m) => m.readRate,
    format: formatPercent,
    compare: false,
  },
};

export async function KpiWidget(props: WidgetServerProps): Promise<ReactNode> {
  const metric =
    KPI_METRICS[dataOf(props).metric ?? "views"] ?? KPI_METRICS.views;
  if (!metric) {
    return <Denied />;
  }
  return await staffWidget(props, async ({ scope, db, range }) => {
    const { current, previous } = await newsSummary(db, scope, { range });
    const now = metric.value(current);
    const before = metric.value(previous);
    return (
      <Kpi
        change={
          metric.compare && now !== null && before !== null
            ? describeChange(now, before)
            : undefined
        }
        label={metric.label}
        note={`last ${range.days} days`}
        tag="reported"
        value={metric.format(now)}
      />
    );
  });
}

export const FunnelWidget = (props: WidgetServerProps): Promise<ReactNode> =>
  staffWidget(props, async ({ scope, db, range }) => (
    <FunnelPanel days={await newsDaily(db, scope, { range })} />
  ));

export const TopArticlesWidget = (
  props: WidgetServerProps
): Promise<ReactNode> =>
  staffWidget(props, async ({ scope, db, range }) => (
    <TopArticlesPanel
      articles={await newsTopArticles(db, scope, { range, limit: 5 })}
      hint={`By views, last ${range.days} days`}
    />
  ));

export const SurfacesWidget = (props: WidgetServerProps): Promise<ReactNode> =>
  staffWidget(props, async ({ scope, db, range }) => (
    <SurfacesPanel surfaces={await newsSurfaces(db, scope, { range })} />
  ));

export const CategoriesWidget = (
  props: WidgetServerProps
): Promise<ReactNode> =>
  staffWidget(props, async ({ scope, db, range }) => (
    <CategoriesPanel
      categories={await newsTopCategories(db, scope, { range, limit: 5 })}
    />
  ));

// --- audience ---------------------------------------------------------------

type AudienceMetric = {
  label: string;
  value: (s: AudienceSummary) => number | null;
  before?: (s: AudienceSummary) => number | null;
  format: (v: number | null) => string;
  note: (range: { days: number }) => string;
};

export const AUDIENCE_KPI_METRICS: Record<string, AudienceMetric> = {
  registered: {
    label: "Registered",
    value: (s) => s.registered,
    format: count,
    note: () => "accounts, all time",
  },
  newUsers: {
    label: "New accounts",
    value: (s) => s.newUsers.current,
    before: (s) => s.newUsers.previous,
    format: count,
    note: (range) => `last ${range.days} days`,
  },
  active7: {
    label: "Active, 7 days",
    value: (s) => s.active7,
    format: count,
    note: () => "right now",
  },
  active30: {
    label: "Active, 30 days",
    value: (s) => s.active30,
    format: count,
    note: () => "right now",
  },
  verifiedRate: {
    label: "Verified",
    value: (s) => s.verifiedRate,
    format: formatPercent,
    note: () => "of registered",
  },
  pushRate: {
    label: "Push enabled",
    value: (s) => s.pushRate,
    format: formatPercent,
    note: () => "of registered",
  },
  guests: {
    label: "Guests now",
    value: (s) => s.guests,
    format: count,
    note: () => "snapshot; deleted daily",
  },
};

export async function AudienceKpiWidget(
  props: WidgetServerProps
): Promise<ReactNode> {
  const metric =
    AUDIENCE_KPI_METRICS[dataOf(props).metric ?? "registered"] ??
    AUDIENCE_KPI_METRICS.registered;
  if (!metric) {
    return <Denied />;
  }
  return await staffWidget(props, async ({ scope, db, range }) => {
    const summary = await audienceSummary(db, scope, { range });
    const now = metric.value(summary);
    const before = metric.before?.(summary) ?? null;
    return (
      <Kpi
        change={
          before !== null && now !== null
            ? describeChange(now, before)
            : undefined
        }
        label={metric.label}
        note={metric.note(range)}
        tag="observed"
        value={metric.format(now)}
      />
    );
  });
}

export const GrowthWidget = (props: WidgetServerProps): Promise<ReactNode> =>
  staffWidget(props, async ({ scope, db, range }) => (
    <GrowthPanel days={await audienceDaily(db, scope, { range })} />
  ));

export const DevicesWidget = (props: WidgetServerProps): Promise<ReactNode> =>
  staffWidget(props, async ({ scope, db, range }) => {
    const { byType, byVersion } = await audienceDevices(db, scope, { range });
    return <DevicesPanel byType={byType} byVersion={byVersion} />;
  });

export const CountriesWidget = (props: WidgetServerProps): Promise<ReactNode> =>
  staffWidget(props, async ({ scope, db, range }) => (
    <CountriesPanel
      countries={await audienceCountries(db, scope, { range, limit: 8 })}
    />
  ));

export const FeedbackWidget = (props: WidgetServerProps): Promise<ReactNode> =>
  staffWidget(props, async ({ scope, db, range }) => (
    <FeedbackPanel feedback={await feedbackSummary(db, scope, { range })} />
  ));

// --- needs attention and push -------------------------------------------------

export const AttentionWidget = (
  props: WidgetServerProps
): Promise<ReactNode> =>
  staffWidget(props, async ({ scope, db }) => (
    <NeedsAttentionPanel counts={await needsAttention(db, scope, {})} />
  ));

export const PushWidget = (props: WidgetServerProps): Promise<ReactNode> =>
  staffWidget(props, async ({ scope, db, range }) => (
    <PushPanel
      report={await pushReport(db, scope, { range, limit: 10 })}
      timeZone={ANALYTICS_TIME_ZONE}
    />
  ));

/**
 * How partners are doing. A partner is shown their own; staff see every
 * partner together. This is the one widget a partner's home is made of.
 */
export async function PartnerPerformanceWidget(
  props: WidgetServerProps
): Promise<ReactNode> {
  const scope = scopeOfRequest(props.req);
  if (!scope) {
    return <Denied />;
  }
  const range = resolveRange({
    days: toDays(dataOf(props).days),
    timeZone: ANALYTICS_TIME_ZONE,
  });
  const db = dbOf(props.req);

  try {
    const [summary, recent] = await Promise.all([
      partnerSummary(db, scope, { range }),
      partnerRecentConversions(db, scope, { limit: 5 }),
    ]);
    return (
      <>
        <Styles />
        <div className="ana">
          <PartnerKpis
            current={summary.conversions.current}
            previous={summary.conversions.previous}
          />
          <RecentConversionsPanel
            rows={recent}
            showPartner={scope.kind === "staff"}
            timeZone={ANALYTICS_TIME_ZONE}
          />
        </div>
      </>
    );
  } catch (error) {
    if (error instanceof AnalyticsAccessError) {
      return <Denied />;
    }
    throw error;
  }
}
