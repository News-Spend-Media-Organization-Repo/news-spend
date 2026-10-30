import type {
  ActivationWeek,
  ActiveDay,
  ArticleReport,
  AttentionCounts,
  AudienceSummary,
  CohortRow,
  ConversionOutcomes,
  DiscoverDay,
  DiscoverGame,
  DiscoverItemType,
  DiscoverSection,
  DiscoverSummary,
  FeedbackSummary,
  GiveawayAttention,
  GiveawayReport,
  GiveawayState,
  LargeGrant,
  LeaderboardRow,
  Measure,
  NewsDay,
  NewsEngagement,
  NewsMetrics,
  PartnerDay,
  PartnerIntegration,
  PointsConcentration,
  PointsDay,
  PointsSource,
  PointsTotals,
  PostbackHealth,
  PushReport,
  RecentConversion,
  Stickiness,
  TopArticle,
  TopSort,
} from "@news-spend-media/analytics";
import type { ReactNode } from "react";

import { ADMIN_PATH, ANALYTICS_TIME_ZONE } from "./access";
import {
  describeChange,
  formatCount,
  formatDateTime,
  formatDay,
  formatDuration,
  formatPercent,
  localDay,
} from "./format";
import { SORT_LABELS } from "./params";
import { Bars, DataTable, DayChart, Kpi, Panel, SERIES_COLORS } from "./ui";

/** Presentation of each report, from data already loaded. No queries here. */

type Summary = { current: NewsMetrics; previous: NewsMetrics };

const platformLabel = (platform: string): string => {
  if (platform === "ios") {
    return "iOS";
  }
  return platform.charAt(0).toUpperCase() + platform.slice(1);
};

const SURFACE_LABELS: Record<string, string> = {
  HomeFeed: "Home feed",
  HomeTrending: "Trending",
  HomeRelated: "Related",
  other: "Other",
};

export function NewsKpis({
  summary,
  daily,
  period,
}: {
  summary: Summary;
  /** The period's daily series, for the line under each figure. */
  daily?: NewsDay[];
  /** The window as shown to readers; defaults to "last N days". */
  period?: string;
}): ReactNode {
  const { current, previous } = summary;
  const days = daily?.length ?? 0;
  const window = period ?? `last ${days} days`;
  const trend = (name: string, pick: (day: NewsDay) => number) => ({
    trend: daily?.map(pick),
    trendLabel: `${name}, ${window}`,
  });
  const versus = "vs previous period";
  return (
    <div className="ana-grid ana-kpis">
      <Kpi
        change={describeChange(current.views, previous.views)}
        label="Views"
        note={versus}
        tag="reported"
        value={formatCount(current.views)}
        {...trend("Views", (d) => d.views)}
      />
      <Kpi
        change={describeChange(current.reads, previous.reads)}
        label="Qualified reads"
        note={versus}
        tag="reported"
        value={formatCount(current.reads)}
        {...trend("Qualified reads", (d) => d.reads)}
      />
      <Kpi
        label="Read rate"
        note="reads per view"
        tag="reported"
        value={formatPercent(current.readRate)}
      />
      <Kpi
        label="Click-through"
        note="matched views per impression"
        tag="reported"
        value={formatPercent(current.ctr)}
      />
      <Kpi
        change={describeChange(current.impressions, previous.impressions)}
        label="Impressions"
        note={versus}
        tag="reported"
        value={formatCount(current.impressions)}
        {...trend("Impressions", (d) => d.impressions)}
      />
      <Kpi
        change={describeChange(current.shares, previous.shares)}
        label="Shares"
        note={versus}
        tag="reported"
        value={formatCount(current.shares)}
      />
      <Kpi
        change={describeChange(current.directOpens, previous.directOpens)}
        label="Direct opens"
        note="views with no earlier impression"
        tag="reported"
        value={formatCount(current.directOpens)}
      />
    </div>
  );
}

export function FunnelPanel({
  days,
}: {
  days: { date: string; impressions: number; views: number; reads: number }[];
}): ReactNode {
  return (
    <Panel
      hint="Impressions, views and qualified reads by day"
      tag="reported"
      title="Reader funnel"
    >
      <DayChart
        days={days}
        label="Reader funnel"
        series={[
          {
            key: "impressions",
            label: "Impressions",
            color: SERIES_COLORS.pale,
          },
          { key: "views", label: "Views", color: SERIES_COLORS.deep },
          { key: "reads", label: "Reads", color: SERIES_COLORS.gold },
        ]}
      />
    </Panel>
  );
}

export function StepsPanel({ current }: { current: NewsMetrics }): ReactNode {
  return (
    <Panel
      hint="Views include direct opens: views with no earlier impression. Reads as a share of views."
      tag="reported"
      title="From impression to read"
    >
      <Bars
        label="From impression to read"
        rows={[
          { label: "Impressions", value: current.impressions },
          {
            label: "Views",
            value: current.views,
            display: `${formatCount(current.views)} · ${formatCount(current.directOpens)} direct`,
          },
          {
            label: "Qualified reads",
            value: current.reads,
            display: `${formatCount(current.reads)} · ${formatPercent(current.readRate)}`,
          },
        ]}
      />
    </Panel>
  );
}

export function SurfacesPanel({
  surfaces,
}: {
  surfaces: { surface: string; impressions: number }[];
}): ReactNode {
  return (
    <Panel
      hint="Where the article was shown"
      tag="reported"
      title="Impressions by surface"
    >
      <Bars
        label="Impressions by surface"
        rows={surfaces.map((s) => ({
          label: SURFACE_LABELS[s.surface] ?? s.surface,
          value: s.impressions,
        }))}
      />
    </Panel>
  );
}

export function PlatformsPanel({
  platforms,
}: {
  platforms: { platform: string; views: number; reads: number }[];
}): ReactNode {
  return (
    <Panel hint="Views by platform" tag="reported" title="Platforms">
      <Bars
        label="Platforms"
        rows={platforms.map((p) => ({
          label: platformLabel(p.platform),
          value: p.views,
          display: `${formatCount(p.views)} views · ${formatCount(p.reads)} reads`,
        }))}
      />
    </Panel>
  );
}

export function EngagementPanel({
  engagement,
}: {
  engagement: NewsEngagement;
}): ReactNode {
  return (
    <Panel
      hint="Likes, shares and comments opened"
      tag="reported"
      title="Engagement"
    >
      <Bars
        label="Engagement"
        rows={[
          { label: "Likes", value: engagement.likes },
          { label: "Dislikes", value: engagement.dislikes },
          { label: "Shares", value: engagement.shares },
          { label: "Comments opened", value: engagement.comments },
        ]}
      />
      {engagement.shareMethods.length > 0 ? (
        <>
          <div className="ana-muted">Shared through</div>
          <Bars
            label="Shared through"
            rows={engagement.shareMethods.map((m) => ({
              label: m.method,
              value: m.shares,
            }))}
          />
        </>
      ) : null}
    </Panel>
  );
}

export function TopArticlesPanel({
  articles,
  days,
  sort,
  period,
  title = "Top articles",
}: {
  articles: TopArticle[];
  days: number;
  sort: TopSort;
  /** The window as shown to readers; defaults to "last N days". */
  period?: string;
  title?: string;
}): ReactNode {
  // The ranking covers the whole period, so an evergreen can stay on top for
  // months; "rising" is the sort that shows what is hot now.
  const window = period ?? `last ${days} days`;
  const hint =
    sort === "rising"
      ? `By rising, ${window} — what is hot right now`
      : `By ${SORT_LABELS[sort].toLowerCase()}, ${window} — ranked over the whole period`;
  return (
    <Panel hint={hint} tag="reported" title={title}>
      <DataTable
        columns={[
          { key: "article", label: "Article" },
          { key: "published", label: "Published" },
          { key: "readers", label: "Readers", align: "right" },
          { key: "views", label: "Views", align: "right" },
          { key: "reads", label: "Reads", align: "right" },
          { key: "ctr", label: "CTR", align: "right" },
        ]}
        empty="No articles were read in this period."
        rows={articles.map((a) => ({
          key: a.id,
          cells: {
            article: (
              <>
                <a href={`${ADMIN_PATH}/collections/news/${a.id}/stats`}>
                  {a.title ?? "Untitled"}
                </a>
                {a.category ? (
                  <div className="ana-sub">{a.category}</div>
                ) : null}
              </>
            ),
            readers: formatCount(a.readers),
            views: formatCount(a.views),
            reads: formatCount(a.reads),
            ctr: formatPercent(a.ctr),
            published: formatDateTime(a.publishedAt, ANALYTICS_TIME_ZONE),
          },
        }))}
      />
    </Panel>
  );
}

export function CategoriesPanel({
  categories,
}: {
  categories: { category: string; views: number }[];
}): ReactNode {
  return (
    <Panel hint="Views by category" tag="reported" title="Top categories">
      <Bars
        label="Top categories"
        rows={categories.map((c) => ({ label: c.category, value: c.views }))}
      />
    </Panel>
  );
}

export function ArticleReportBody({
  report,
  period,
}: {
  report: ArticleReport;
  period?: string;
}): ReactNode {
  return (
    <>
      <NewsKpis daily={report.daily} period={period} summary={report.summary} />
      <div className="ana-grid ana-two">
        <FunnelPanel days={report.daily} />
        <StepsPanel current={report.summary.current} />
      </div>
      <div className="ana-grid ana-even">
        <SurfacesPanel surfaces={report.surfaces} />
        <PlatformsPanel platforms={report.platforms} />
      </div>
      <EngagementPanel engagement={report.engagement} />
    </>
  );
}

// --- partners ---------------------------------------------------------------

export function PartnerKpis({
  current,
  previous,
}: {
  current: ConversionOutcomes;
  previous: ConversionOutcomes;
}): ReactNode {
  const versus = "vs previous period";
  return (
    <div className="ana-grid ana-kpis">
      <Kpi
        change={describeChange(current.clicks, previous.clicks)}
        label="Clicks"
        note={versus}
        tag="observed"
        value={formatCount(current.clicks)}
      />
      <Kpi
        change={describeChange(current.conversions, previous.conversions)}
        label="Conversions"
        note={versus}
        tag="observed"
        value={formatCount(current.conversions)}
      />
      <Kpi
        label="Conversion rate"
        note="conversions per click"
        tag="observed"
        value={formatPercent(current.conversionRate)}
      />
      <Kpi
        change={describeChange(current.pointsAwarded, previous.pointsAwarded)}
        label="Points awarded"
        note={versus}
        tag="observed"
        value={formatCount(current.pointsAwarded)}
      />
    </div>
  );
}

const INTEGRATION_LABELS: Record<string, string> = {
  manual: "Manual (email/spreadsheet)",
  webhook: "Webhook / postback",
  csv: "CSV upload",
};

export function PartnerIntegrationPanel({
  rows,
}: {
  rows: PartnerIntegration[];
}): ReactNode {
  const total = rows.reduce((sum, row) => sum + row.partners, 0);
  return (
    <Panel
      hint={`${formatCount(total)} partners, by how they send conversion data`}
      title="Partners by integration"
    >
      <Bars
        empty="No partners yet."
        label="Partners by integration method"
        rows={rows.map((row) => ({
          label: INTEGRATION_LABELS[row.method] ?? row.method,
          value: row.partners,
        }))}
      />
    </Panel>
  );
}

export function OutcomesPanel({
  current,
  postbacksExpected = true,
}: {
  current: ConversionOutcomes;
  /** False for a partner that only reports clicks, so "waiting" is just "clicked". */
  postbacksExpected?: boolean;
}): ReactNode {
  return (
    <Panel
      hint="Where the clicks made in this period ended up"
      tag="observed"
      title="Outcomes"
    >
      <Bars
        empty="No clicks in this period."
        label="Outcomes"
        rows={[
          {
            label: postbacksExpected
              ? "Clicked, awaiting the partner"
              : "Clicked",
            value: current.waiting,
          },
          { label: "Converted, points pending", value: current.pending },
          { label: "Points awarded", value: current.awarded },
          { label: "Failed", value: current.failed },
        ]}
      />
    </Panel>
  );
}

export function PartnerDailyPanel({ days }: { days: PartnerDay[] }): ReactNode {
  return (
    <Panel
      hint="Clicks on the day they happened, conversions on the day the partner reported them"
      tag="observed"
      title="Clicks and conversions"
    >
      <DayChart
        days={days}
        label="Clicks and conversions"
        series={[
          { key: "clicks", label: "Clicks", color: SERIES_COLORS.deep },
          {
            key: "conversions",
            label: "Conversions",
            color: SERIES_COLORS.gold,
          },
        ]}
      />
    </Panel>
  );
}

const STATUS_PILL: Record<string, { label: string; tone: string }> = {
  awarded: { label: "Awarded", tone: "ok" },
  converted: { label: "Pending", tone: "warn" },
  clicked: { label: "Clicked", tone: "" },
  failed: { label: "Failed", tone: "bad" },
};

export function RecentConversionsPanel({
  rows,
  showPartner,
  timeZone,
}: {
  rows: RecentConversion[];
  showPartner: boolean;
  timeZone: string;
}): ReactNode {
  const columns = [
    ...(showPartner ? [{ key: "partner", label: "Partner" }] : []),
    { key: "order", label: "Order" },
    { key: "when", label: "When" },
    { key: "points", label: "Points", align: "right" as const },
    { key: "status", label: "Status", align: "right" as const },
  ];
  return (
    <Panel hint="Newest first" tag="observed" title="Recent conversions">
      <DataTable
        columns={columns}
        empty="No conversions yet."
        rows={rows.map((r) => {
          const pill = STATUS_PILL[r.status] ?? { label: r.status, tone: "" };
          return {
            key: r.clickId,
            cells: {
              partner: r.partnerName ?? "–",
              order: (
                <>
                  {r.partnerOrderId ?? r.clickId}
                  {r.content ? (
                    <div className="ana-sub">{r.content}</div>
                  ) : null}
                </>
              ),
              when: formatDateTime(
                r.awardedAt ?? r.convertedAt ?? r.clickedAt,
                timeZone
              ),
              points: r.pointsAwarded > 0 ? formatCount(r.pointsAwarded) : "–",
              status: (
                <span className="ana-pill" data-tone={pill.tone}>
                  {pill.label}
                </span>
              ),
            },
          };
        })}
      />
    </Panel>
  );
}

export function ShopPanel({
  shop,
}: {
  shop: { views: number; clicks: number };
}): ReactNode {
  return (
    <Panel
      hint="Shop-tab views and clicks, sent by the app"
      tag="reported"
      title="Shop tab"
    >
      <Bars
        empty="No shop activity in this period."
        label="Shop tab"
        rows={[
          { label: "Views", value: shop.views },
          { label: "Clicks", value: shop.clicks },
        ]}
      />
    </Panel>
  );
}

// --- audience ---------------------------------------------------------------

export function AudienceKpis({
  summary,
}: {
  summary: AudienceSummary;
}): ReactNode {
  return (
    <div className="ana-grid ana-kpis">
      <Kpi
        label="Registered"
        note="accounts, all time"
        tag="observed"
        value={formatCount(summary.registered)}
      />
      <Kpi
        change={describeChange(
          summary.newUsers.current,
          summary.newUsers.previous
        )}
        label="New"
        note="vs previous period"
        tag="observed"
        value={formatCount(summary.newUsers.current)}
      />
      <Kpi
        label="Active, 7 days"
        note="right now"
        tag="observed"
        value={formatCount(summary.active7)}
      />
      <Kpi
        label="Active, 30 days"
        note="right now"
        tag="observed"
        value={formatCount(summary.active30)}
      />
      <Kpi
        label="Email verified"
        note={`${formatPercent(summary.emailVerifiedRate)} of registered`}
        tag="observed"
        value={formatCount(summary.emailVerified)}
      />
      <Kpi
        label="Push enabled"
        note={`${formatPercent(summary.pushRate)} of registered`}
        tag="observed"
        value={formatCount(summary.pushEnabled)}
      />
      <Kpi
        label="Guests now"
        note="snapshot; guests are deleted daily"
        tag="observed"
        value={formatCount(summary.guests)}
      />
    </div>
  );
}

export function GrowthPanel({
  days,
}: {
  days: { date: string; newUsers: number }[];
}): ReactNode {
  return (
    <Panel
      hint="New registered accounts by day"
      tag="observed"
      title="Audience growth"
    >
      <DayChart
        days={days}
        label="Audience growth"
        series={[
          {
            key: "newUsers",
            label: "New accounts",
            color: SERIES_COLORS.deep,
          },
        ]}
      />
    </Panel>
  );
}

export function DevicesPanel({
  byType,
  byVersion,
}: {
  byType: { label: string; tokens: number }[];
  byVersion: { label: string; tokens: number }[];
}): ReactNode {
  return (
    <Panel hint="Where active push tokens live" tag="observed" title="Devices">
      <div className="ana-muted">By device type</div>
      <Bars
        empty="No active push tokens."
        label="By device type"
        rows={byType.map((d) => ({ label: d.label, value: d.tokens }))}
      />
      <div className="ana-muted">By app version</div>
      <Bars
        empty="No active push tokens."
        label="By app version"
        rows={byVersion.map((d) => ({ label: d.label, value: d.tokens }))}
      />
    </Panel>
  );
}

export function CountriesPanel({
  countries,
}: {
  countries: { country: string; users: number }[];
}): ReactNode {
  return (
    <Panel
      hint="Checked identity country first, self-reported fills the rest"
      tag="observed"
      title="Top countries"
    >
      <Bars
        empty="No country recorded yet."
        label="Top countries"
        rows={countries.map((c) => ({ label: c.country, value: c.users }))}
      />
    </Panel>
  );
}

export function FeedbackPanel({
  feedback,
}: {
  feedback: FeedbackSummary;
}): ReactNode {
  return (
    <Panel
      hint={`Average ${feedback.average ?? "–"} across ${formatCount(feedback.total)} reports`}
      tag="observed"
      title="Feedback"
    >
      <Bars
        empty="No feedback in this period."
        label="Feedback"
        rows={feedback.byType.map((t) => ({
          label: t.type,
          value: t.count,
          display: `${formatCount(t.count)} · avg ${t.average ?? "–"}`,
        }))}
      />
    </Panel>
  );
}

// --- needs attention and push ------------------------------------------------

const QUEUE_ROWS: {
  key: keyof AttentionCounts;
  label: string;
  slug?: string;
  href?: string;
  note?: string;
}[] = [
  {
    key: "commentsHidden",
    label: "Comments awaiting review",
    slug: "comments",
  },
  {
    key: "reportsPending",
    label: "Content reports pending",
    slug: "contentReports",
  },
  {
    key: "identityInReview",
    label: "Identity checks in review",
    slug: "identity-checks",
  },
  {
    key: "flagsUnreviewed",
    label: "Suspicious accounts awaiting review",
    slug: "giveaway-account-flags",
  },
  {
    key: "pushFailed",
    label: "Failed push deliveries, 7 days",
    slug: "notification-deliveries",
  },
  {
    key: "witnessWeek",
    label: "Witness reports, 7 days",
    slug: "witness-reports",
    note: "A count, not a queue: witness reports carry no status.",
  },
  {
    key: "largeGrants",
    label: "Large point grants, 7 days",
    href: `${ADMIN_PATH}/analytics/points`,
    note: "A count, not a queue: open the Points page to review each grant.",
  },
];

export function NeedsAttentionPanel({
  counts,
}: {
  counts: AttentionCounts;
}): ReactNode {
  return (
    <Panel
      hint="Each count links to its list"
      tag="observed"
      title="Needs attention"
    >
      <DataTable
        columns={[
          { key: "area", label: "Area" },
          { key: "open", label: "Open", align: "right" },
        ]}
        empty="Nothing needs attention."
        rows={QUEUE_ROWS.map((row) => ({
          key: row.key,
          cells: {
            area: (
              <>
                <a
                  href={
                    row.href ?? `${ADMIN_PATH}/collections/${row.slug ?? ""}`
                  }
                >
                  {row.label}
                </a>
                {row.note ? <div className="ana-sub">{row.note}</div> : null}
              </>
            ),
            open: formatCount(counts[row.key]),
          },
        }))}
      />
    </Panel>
  );
}

export function PushPanel({
  report,
  timeZone,
}: {
  report: PushReport;
  timeZone: string;
}): ReactNode {
  return (
    <Panel
      hint={`${formatCount(report.totals.campaigns)} sent · delivered ${formatCount(report.totals.delivered)} · opened ${formatPercent(report.totals.openedRate)} · failed ${formatPercent(report.totals.failedRate)}. Opens are reported by the app.`}
      tag="mixed"
      title="Push campaigns"
    >
      <DataTable
        columns={[
          { key: "campaign", label: "Campaign" },
          { key: "sent", label: "Sent" },
          { key: "delivered", label: "Delivered", align: "right" },
          { key: "opened", label: "Opened", align: "right" },
        ]}
        empty="No campaigns sent in this period."
        rows={report.campaigns.map((c) => ({
          key: c.id,
          cells: {
            campaign: c.title ?? "Untitled",
            sent: formatDateTime(c.sentAt, timeZone),
            delivered: formatCount(c.delivered),
            opened: formatPercent(c.openedRate),
          },
        }))}
      />
    </Panel>
  );
}

// --- points -----------------------------------------------------------------

export function PointsKpis({
  summary,
  daily,
  period,
}: {
  summary: {
    current: PointsTotals;
    previous: PointsTotals;
    outstanding: number;
  };
  /** The period's daily series, for the line under each figure. */
  daily?: PointsDay[];
  /** The window as shown to readers; defaults to "last N days". */
  period?: string;
}): ReactNode {
  const { current, previous, outstanding } = summary;
  const days = daily?.length ?? 0;
  const window = period ?? `last ${days} days`;
  const trend = (name: string, pick: (day: PointsDay) => number) => ({
    trend: daily?.map(pick),
    trendLabel: `${name}, ${window}`,
  });
  const versus = "vs previous period";
  return (
    <div className="ana-grid ana-kpis">
      <Kpi
        change={describeChange(current.issued, previous.issued)}
        label="Issued"
        note={versus}
        tag="observed"
        value={formatCount(current.issued)}
        {...trend("Issued", (d) => d.issued)}
      />
      <Kpi
        change={describeChange(current.spent, previous.spent)}
        label="Spent"
        note={versus}
        tag="observed"
        value={formatCount(current.spent)}
        {...trend("Spent", (d) => d.spent)}
      />
      <Kpi
        change={describeChange(current.net, previous.net)}
        label="Net"
        note={versus}
        tag="observed"
        value={formatCount(current.net)}
      />
      <Kpi
        label="Outstanding"
        note="all time"
        tag="observed"
        value={formatCount(outstanding)}
      />
      <Kpi
        change={describeChange(current.activeEarners, previous.activeEarners)}
        label="Active earners"
        note={versus}
        tag="observed"
        value={formatCount(current.activeEarners)}
      />
      <Kpi
        change={describeChange(current.largeGrants, previous.largeGrants)}
        label="Large grants"
        note={versus}
        tag="observed"
        value={formatCount(current.largeGrants)}
      />
    </div>
  );
}

export function PointsDailyPanel({ days }: { days: PointsDay[] }): ReactNode {
  return (
    <Panel
      hint="Issued and spent by day"
      tag="observed"
      title="Issued and spent by day"
    >
      <DayChart
        days={days}
        label="Issued and spent by day"
        series={[
          { key: "issued", label: "Issued", color: SERIES_COLORS.deep },
          { key: "spent", label: "Spent", color: SERIES_COLORS.gold },
        ]}
      />
    </Panel>
  );
}

export function PointsSourcesPanel({
  sources,
}: {
  sources: PointsSource[];
}): ReactNode {
  return (
    <Panel
      hint="Points issued, by source"
      tag="observed"
      title="Issued by source"
    >
      <Bars
        empty="No points were issued in this period."
        label="Issued by source"
        rows={sources.map((s) => ({
          label: s.source,
          value: s.issued,
          display: formatCount(s.issued),
        }))}
      />
    </Panel>
  );
}

export function ConcentrationPanel({
  concentration,
}: {
  concentration: PointsConcentration;
}): ReactNode {
  const figure = (value: number | null) =>
    value === null ? "–" : formatCount(value);
  return (
    <Panel
      hint="Every account with at least one ledger row"
      tag="observed"
      title="Balance concentration"
    >
      <div className="ana-grid ana-kpis">
        <Kpi label="Holders" value={formatCount(concentration.holders)} />
        <Kpi label="Median balance" value={figure(concentration.median)} />
        <Kpi label="90th percentile" value={figure(concentration.p90)} />
        <Kpi
          label="Top 10 share"
          value={formatPercent(concentration.top10Share)}
        />
      </div>
    </Panel>
  );
}

export function LeaderboardPanel({
  rows,
}: {
  rows: LeaderboardRow[];
}): ReactNode {
  return (
    <Panel
      hint="Earned from activity; the sign-up bonus and large grants are left out. Peak hour is the most earned in a single hour: a script earns a large share of its total in one."
      tag="observed"
      title="Leaderboard"
    >
      <DataTable
        columns={[
          { key: "rank", label: "Rank" },
          { key: "user", label: "User" },
          { key: "earned", label: "Earned", align: "right" },
          { key: "peak", label: "Peak hour", align: "right" },
          { key: "events", label: "Events", align: "right" },
          { key: "balance", label: "Balance", align: "right" },
          { key: "joined", label: "Joined" },
          { key: "source", label: "Top source" },
          { key: "account", label: "Account" },
        ]}
        empty="No one earned points from activity in this period."
        rows={rows.map((r) => ({
          key: r.userId,
          cells: {
            rank: r.rank,
            user: r.name || r.username || "–",
            earned: formatCount(r.earned),
            peak: formatCount(r.peakHour),
            events: formatCount(r.events),
            balance: formatCount(r.balance),
            joined: r.joinedAt
              ? formatDay(localDay(r.joinedAt, ANALYTICS_TIME_ZONE))
              : "–",
            source: r.topSource ?? "–",
            account: (
              <a href={`${ADMIN_PATH}/collections/users/${r.userId}`}>
                Open account
              </a>
            ),
          },
        }))}
      />
    </Panel>
  );
}

export function LargeGrantsPanel({
  grants,
}: {
  grants: LargeGrant[];
}): ReactNode {
  return (
    <Panel
      hint="Single grants above 5,000 points"
      tag="observed"
      title="Large point grants"
    >
      <DataTable
        columns={[
          { key: "date", label: "Date" },
          { key: "user", label: "User" },
          { key: "source", label: "Source" },
          { key: "points", label: "Points", align: "right" },
          { key: "account", label: "Account" },
        ]}
        empty="No single grant above 5,000 points in this period."
        rows={grants.map((g) => ({
          key: g.id,
          cells: {
            date: g.at ? formatDay(localDay(g.at, ANALYTICS_TIME_ZONE)) : "–",
            user: g.name || g.username || "–",
            source: g.source,
            points: formatCount(g.points),
            account: g.userId ? (
              <a href={`${ADMIN_PATH}/collections/users/${g.userId}`}>
                Open account
              </a>
            ) : (
              "–"
            ),
          },
        }))}
      />
    </Panel>
  );
}

// --- retention --------------------------------------------------------------

/** A percentage from two counts, or null when nothing is eligible. */
const rateOf = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 1000) / 10;

/** `returned / eligible (pct)`, or `–` while nothing is eligible. */
const measureText = (measure: Measure): ReactNode =>
  measure.eligible === 0
    ? "–"
    : `${formatCount(measure.returned)} / ${formatCount(measure.eligible)} (${formatPercent(rateOf(measure.returned, measure.eligible))})`;

export function RetentionKpis({
  summary,
  weeks,
}: {
  summary: { current: Stickiness; previous: Stickiness };
  weeks: ActivationWeek[];
}): ReactNode {
  const { current, previous } = summary;
  const mature = weeks.reduce((total, w) => total + w.mature24h, 0);
  const activated = weeks.reduce((total, w) => total + w.activated24h, 0);
  const versus = "vs previous period";
  return (
    <div className="ana-grid ana-kpis">
      <Kpi
        change={describeChange(current.wau, previous.wau)}
        label="Active devices (7 days)"
        note={versus}
        tag="observed"
        value={formatCount(current.wau)}
      />
      <Kpi
        change={describeChange(current.mau, previous.mau)}
        label="Active devices (30 days)"
        note={versus}
        tag="observed"
        value={formatCount(current.mau)}
      />
      <Kpi
        label="Stickiness"
        note="daily actives / monthly actives"
        tag="observed"
        value={formatPercent(current.stickiness)}
      />
      <Kpi
        label="Activation (24 hours)"
        note={`${formatCount(activated)} of ${formatCount(mature)} mature signups`}
        tag="observed"
        value={formatPercent(rateOf(activated, mature))}
      />
    </div>
  );
}

export function ActiveDevicesPanel({ days }: { days: ActiveDay[] }): ReactNode {
  return (
    <Panel
      hint="Distinct devices with any event, by Lagos day"
      tag="observed"
      title="Active devices by day"
    >
      <DayChart
        days={days}
        label="Active devices by day"
        series={[
          {
            key: "devices",
            label: "Active devices",
            color: SERIES_COLORS.deep,
          },
        ]}
      />
    </Panel>
  );
}

export function ActivationPanel({
  weeks,
}: {
  weeks: ActivationWeek[];
}): ReactNode {
  return (
    <Panel
      hint="Registered accounts by the Lagos week they signed up"
      tag="observed"
      title="Activation by signup week"
    >
      <DataTable
        columns={[
          { key: "week", label: "Week" },
          { key: "signups", label: "Signups", align: "right" },
          { key: "day", label: "Read within 24h", align: "right" },
          { key: "week7", label: "Read within 7d", align: "right" },
          { key: "never", label: "Never read (mature)", align: "right" },
        ]}
        empty="No accounts signed up in this period."
        rows={weeks.map((w) => ({
          key: w.week,
          cells: {
            week: formatDay(w.week),
            signups: formatCount(w.signups),
            day: measureText({
              returned: w.activated24h,
              eligible: w.mature24h,
            }),
            week7: measureText({
              returned: w.activated7d,
              eligible: w.mature7d,
            }),
            never: w.mature7d === 0 ? "–" : formatCount(w.neverRead),
          },
        }))}
      />
    </Panel>
  );
}

export function CohortsPanel({ cohorts }: { cohorts: CohortRow[] }): ReactNode {
  return (
    <Panel
      hint="Devices by the Lagos week they were first seen; rates count only elapsed windows"
      tag="observed"
      title="Device cohorts"
    >
      <DataTable
        columns={[
          { key: "week", label: "Week" },
          { key: "devices", label: "New devices", align: "right" },
          { key: "d1", label: "D1", align: "right" },
          { key: "w1", label: "W1", align: "right" },
          { key: "w2", label: "W2", align: "right" },
          { key: "w4", label: "W4", align: "right" },
        ]}
        empty="No devices were first seen in this period."
        rows={cohorts.map((c) => ({
          key: c.week,
          cells: {
            week: (
              <>
                {formatDay(c.week)}
                {c.w4.eligible < c.devices ? (
                  <div className="ana-sub">partial</div>
                ) : null}
              </>
            ),
            devices: formatCount(c.devices),
            d1: measureText(c.d1),
            w1: measureText(c.w1),
            w2: measureText(c.w2),
            w4: measureText(c.w4),
          },
        }))}
      />
    </Panel>
  );
}

// --- giveaway ---------------------------------------------------------------

const GIVEAWAY_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  ready: "Ready",
  pool_building: "Pool building",
  pool_locked: "Pool locked",
  draw_in_progress: "Draw in progress",
  interrupted: "Interrupted",
  resumption_authorized: "Resumption authorized",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function GiveawayStatePanel({
  state,
}: {
  state: GiveawayState;
}): ReactNode {
  return (
    <div className="ana-grid ana-kpis">
      <Kpi
        label="State"
        note={
          {
            open: "entries open",
            pending: `opens in ${formatDuration(state.msToOpen)}`,
            closed: "entries closed, awaiting the draw",
            inactive: "entries closed",
          }[state.phase]
        }
        tag="observed"
        value={GIVEAWAY_STATUS_LABELS[state.status] ?? state.status}
      />
      <Kpi
        label="Time to draw"
        note={
          state.endDate ? `closes ${state.endDate.slice(0, 10)}` : "no date set"
        }
        tag="observed"
        value={formatDuration(state.msToDraw)}
      />
      <Kpi
        label="Participants"
        note="locked at draw"
        tag="observed"
        value={
          state.totalValidParticipants === null
            ? "–"
            : formatCount(state.totalValidParticipants)
        }
      />
    </div>
  );
}

export function GiveawayTicketsPanel({
  report,
}: {
  report: Pick<GiveawayReport, "tickets" | "ticketDaily">;
}): ReactNode {
  return (
    <>
      <div className="ana-grid ana-kpis">
        <Kpi
          label="Tickets issued"
          note="valid tickets"
          tag="observed"
          value={formatCount(report.tickets.issued)}
        />
        <Kpi
          label="Entrants"
          note="holders of valid tickets"
          tag="observed"
          value={formatCount(report.tickets.entrants)}
        />
      </div>
      <Panel hint="Valid tickets by day" tag="observed" title="Tickets">
        <DayChart
          days={report.ticketDaily}
          label="Tickets"
          series={[
            { key: "issued", label: "Issued", color: SERIES_COLORS.deep },
            { key: "entrants", label: "Entrants", color: SERIES_COLORS.gold },
          ]}
        />
      </Panel>
    </>
  );
}

export function GiveawayEngagementsPanel({
  report,
}: {
  report: Pick<GiveawayReport, "engagements">;
}): ReactNode {
  return (
    <Panel
      hint="Completed engagements only: only completed ones count towards tier eligibility. Tickets carry no source, so this is engagements, not tickets."
      tag="observed"
      title="Engagements by source"
    >
      <DayChart
        days={report.engagements.days}
        label="Engagements by source"
        series={[
          { key: "partner", label: "Partner item", color: SERIES_COLORS.deep },
          {
            key: "google",
            label: "Google rewarded ad",
            color: SERIES_COLORS.gold,
          },
        ]}
      />
      <div className="ana-muted">
        {formatCount(report.engagements.totals.boost)} Boosts ·{" "}
        {formatCount(report.engagements.totals.featuredOffer)} Featured Offers
      </div>
    </Panel>
  );
}

export function GiveawayPoolPanel({
  pool,
}: {
  pool: GiveawayReport["pool"];
}): ReactNode {
  return (
    <Panel
      hint="Distinct eligible users per tier, locked when the draw begins"
      tag="observed"
      title="Pool composition"
    >
      <Bars
        empty="The pool locks when the draw begins; nothing to show before then."
        label="Pool composition"
        rows={pool.map((t) => ({
          label: t.tier,
          value: t.candidates,
          display: `${formatCount(t.candidates)} candidates`,
        }))}
      />
    </Panel>
  );
}

export function GiveawayPrizesPanel({
  prizes,
}: {
  prizes: GiveawayReport["prizes"];
}): ReactNode {
  return (
    <Panel hint="Stock per tier" tag="observed" title="Prizes">
      <DataTable
        columns={[
          { key: "tier", label: "Tier" },
          { key: "max", label: "Stock", align: "right" },
          { key: "awarded", label: "Awarded", align: "right" },
          { key: "remaining", label: "Left", align: "right" },
        ]}
        empty="No prizes configured for this giveaway."
        rows={prizes.map((p) => ({
          key: p.tier,
          cells: {
            tier: p.tier,
            max: formatCount(p.maxUnits),
            awarded: formatCount(p.awarded),
            remaining: formatCount(p.remaining),
          },
        }))}
      />
    </Panel>
  );
}

export function GiveawayWinnersPanel({
  report,
  timeZone,
}: {
  report: Pick<GiveawayReport, "winners" | "recentWinners">;
  timeZone: string;
}): ReactNode {
  return (
    <Panel
      hint="Who won what, without naming anyone"
      tag="observed"
      title="Winners"
    >
      <Bars
        empty="No winners yet."
        label="Winners"
        rows={report.winners.byTier.map((t) => ({
          label: t.tier,
          value: t.winners,
        }))}
      />
      <div className="ana-muted">By claim</div>
      <Bars
        empty="No winners yet."
        label="By claim"
        rows={report.winners.byClaim.map((s) => ({
          label: s.status,
          value: s.winners,
        }))}
      />
      <div className="ana-muted">By fulfilment</div>
      <Bars
        empty="No winners yet."
        label="By fulfilment"
        rows={report.winners.byFulfilment.map((s) => ({
          label: s.status,
          value: s.winners,
        }))}
      />
      {report.recentWinners.length > 0 ? (
        <>
          <div className="ana-muted">Latest</div>
          <DataTable
            columns={[
              { key: "prize", label: "Prize" },
              { key: "when", label: "Won" },
              { key: "claim", label: "Claim", align: "right" },
              { key: "fulfilment", label: "Fulfilment", align: "right" },
            ]}
            empty="No winners yet."
            rows={report.recentWinners.map((w, i) => ({
              key: `${w.tier}-${i}`,
              cells: {
                prize: (
                  <>
                    {w.prize ?? "–"}
                    <div className="ana-sub">{w.tier}</div>
                  </>
                ),
                when: formatDateTime(w.selectedAt, timeZone),
                claim: w.claimStatus,
                fulfilment: w.fulfilmentStatus,
              },
            }))}
          />
        </>
      ) : null}
    </Panel>
  );
}

export function GiveawayFulfilmentPanel({
  fulfilment,
}: {
  fulfilment: GiveawayReport["fulfilment"];
}): ReactNode {
  return (
    <Panel
      hint="Dispatch attempts through the prize provider"
      tag="observed"
      title="Fulfilment"
    >
      <Bars
        empty="Nothing dispatched yet."
        label="Fulfilment"
        rows={[
          { label: "Sent", value: fulfilment.sent },
          { label: "Already sent", value: fulfilment.alreadySent },
          {
            label: "Failed, worth retrying",
            value: fulfilment.retryableFailures,
          },
          {
            label: "Failed, will not succeed",
            value: fulfilment.permanentFailures,
          },
          { label: "Skipped", value: fulfilment.skipped },
        ]}
      />
    </Panel>
  );
}

export function GiveawayAttentionPanel({
  attention,
}: {
  attention: GiveawayAttention;
}): ReactNode {
  return (
    <Panel
      hint="Wins in this giveaway waiting on someone"
      tag="observed"
      title="Needs attention"
    >
      <Bars
        empty="Nothing needs attention."
        label="Needs attention"
        rows={[
          { label: "On hold, account flagged", value: attention.onHold },
          {
            label: "Awaiting identity verification",
            value: attention.awaitingVerification,
          },
          { label: "Disqualified after review", value: attention.disqualified },
          {
            label: "Fulfilment failing",
            value: attention.fulfilmentFailing,
          },
        ]}
      />
    </Panel>
  );
}

export function GiveawayReportBody({
  report,
  timeZone,
}: {
  report: GiveawayReport;
  timeZone: string;
}): ReactNode {
  if (!report.state) {
    return (
      <Panel hint="This giveaway no longer exists." title="No giveaway">
        <div className="ana-empty">Check the address and try again.</div>
      </Panel>
    );
  }
  return (
    <>
      <GiveawayStatePanel state={report.state} />
      <GiveawayTicketsPanel report={report} />
      <div className="ana-grid ana-even">
        <GiveawayEngagementsPanel report={report} />
        <GiveawayPoolPanel pool={report.pool} />
      </div>
      <div className="ana-grid ana-even">
        <GiveawayPrizesPanel prizes={report.prizes} />
        <GiveawayFulfilmentPanel fulfilment={report.fulfilment} />
      </div>
      <div className="ana-grid ana-even">
        <GiveawayWinnersPanel report={report} timeZone={timeZone} />
        <GiveawayAttentionPanel attention={report.attention} />
      </div>
    </>
  );
}

/** Enough postbacks that a rejection rate means something, not noise from one retry. */
const MIN_SAMPLE = 5;
/** A partner signing incorrectly rejects (almost) everything, not half. */
const REJECTED_RATE_THRESHOLD = 50;
/** Enough waiting clicks that "nothing back yet" stops being just a slow partner. */
const MIN_STALLED_CLICKS = 5;

/**
 * Whether this partner's postbacks look broken, from the numbers already on
 * the page. Two independent checks, because they catch different failures:
 * a high rejection rate means postbacks are arriving but failing
 * verification (wrong secret, stale clock); a pile of waiting clicks with
 * nothing received means the partner isn't calling the webhook at all. No
 * background job watches for this — it's read here, live, whenever someone
 * opens the tab.
 */
function postbackTrouble(
  health: PostbackHealth,
  waiting: number
): string | null {
  if (
    health.total >= MIN_SAMPLE &&
    health.rejectedRate !== null &&
    health.rejectedRate >= REJECTED_RATE_THRESHOLD
  ) {
    return `${formatPercent(health.rejectedRate)} of postbacks are being rejected. That usually means the wrong secret is being signed with, or a clock that's drifted.`;
  }

  const received = health.accepted + health.failedReported;
  if (waiting >= MIN_STALLED_CLICKS && received === 0) {
    return `${formatCount(waiting)} clicks were sent to this partner with nothing confirmed back. Their webhook may not be wired up.`;
  }

  return null;
}

export function PostbackHealthPanel({
  health,
  timeZone,
  waiting = 0,
  postbacksExpected = true,
}: {
  health: PostbackHealth;
  timeZone: string;
  /** False for a partner with no webhook (manual or CSV), where silence is normal. */
  postbacksExpected?: boolean;
  /** Clicks sent to the partner that are still only "clicked" for this period. */
  waiting?: number;
}): ReactNode {
  const last = health.lastReceivedAt
    ? `Last postback ${formatDateTime(health.lastReceivedAt, timeZone)}.`
    : "No postback has been received yet.";
  const trouble = postbacksExpected ? postbackTrouble(health, waiting) : null;

  return (
    <Panel
      hint="Conversion postbacks and how each was handled"
      tag="observed"
      title="Postbacks"
    >
      {trouble ? (
        <div className="ana-notice" data-tone="bad">
          <strong>Looks broken.</strong> {trouble}
        </div>
      ) : null}
      {postbacksExpected ? null : (
        <div className="ana-notice">
          This partner does not send postbacks, so only clicks are tracked.
          Conversions and points are not confirmed automatically.
        </div>
      )}
      {health.total === 0 ? (
        <div className="ana-empty">No postbacks in this period. {last}</div>
      ) : (
        <>
          <Bars
            label="Postbacks received"
            rows={[
              { label: "Accepted", value: health.accepted },
              {
                label: "Partner reported a failure",
                value: health.failedReported,
              },
              { label: "Already processed", value: health.duplicate },
              {
                label: "Rejected",
                value: health.rejected,
                display: `${formatCount(health.rejected)} · ${formatPercent(health.rejectedRate)}`,
              },
            ]}
          />
          {health.rejected > 0 ? (
            <div className="ana-notice">
              {formatCount(health.rejected)} could not be verified, so they
              awarded nothing.
              {health.rejectedReasons.length > 0
                ? ` Reasons: ${health.rejectedReasons
                    .map((r) => `${r.reason} (${formatCount(r.count)})`)
                    .join(", ")}.`
                : ""}
            </div>
          ) : null}
          <div className="ana-muted">{last}</div>
        </>
      )}
    </Panel>
  );
}

// --- discover ---------------------------------------------------------------

const DISCOVER_SECTION_LABELS: Record<string, string> = {
  all: "All",
  apps: "Apps",
  games: "Games",
  books: "Books",
  surveys: "Surveys",
};

const DISCOVER_ITEM_LABELS: Record<string, string> = {
  game: "Games",
  app: "Apps",
  book: "Books",
  survey: "Surveys",
  giveaway: "Giveaway button",
  brands: "Connect Brands button",
};

/** A game's slug as a name: `prism-match-3d` reads as `Prism Match 3d`. */
const gameName = (slug: string) =>
  slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/**
 * Is the Discover tab used? Counts devices, not accounts, and only counts the
 * app versions that report it, so reach is measured against the readers seen in
 * the same period and will rise as people update.
 */
export function DiscoverPanel({
  summary,
  sections,
  items,
  games,
  days,
}: {
  summary: DiscoverSummary;
  sections: DiscoverSection[];
  items: DiscoverItemType[];
  games: DiscoverGame[];
  days: DiscoverDay[];
}): ReactNode {
  return (
    <>
      <div className="ana-grid ana-kpis">
        <Kpi
          change={describeChange(
            summary.openers.current,
            summary.openers.previous
          )}
          label="Opened Discover"
          note="devices"
          tag="reported"
          value={formatCount(summary.openers.current)}
        />
        <Kpi
          label="Reach"
          note={`of ${formatCount(summary.readers)} devices reading news`}
          tag="reported"
          value={formatPercent(summary.reach)}
        />
        <Kpi
          label="Items opened"
          note="apps, games, books, surveys, buttons"
          tag="reported"
          value={formatCount(summary.itemOpens)}
        />
        <Kpi
          label="Games started"
          note={`${formatCount(summary.gamesBlocked)} blocked · ${formatCount(summary.gameReports)} reported`}
          tag="reported"
          value={formatCount(summary.gameLaunches)}
        />
      </div>

      <Panel
        hint="Devices that opened the tab each day. Only app versions that report Discover are counted, so this rises as people update."
        tag="reported"
        title="Opens per day"
      >
        <DayChart
          days={days}
          label="Opens per day"
          series={[
            {
              key: "openers",
              label: "Devices",
              color: SERIES_COLORS.deep,
            },
          ]}
        />
      </Panel>

      <div className="ana-grid ana-even">
        <Panel hint="Times a section was shown" tag="reported" title="Sections">
          <Bars
            label="Sections"
            rows={sections.map((s) => ({
              label: DISCOVER_SECTION_LABELS[s.section] ?? s.section,
              value: s.views,
              display: `${formatCount(s.views)} views · ${formatCount(s.people)} devices`,
            }))}
          />
        </Panel>
        <Panel hint="What was tapped" tag="reported" title="What people open">
          <Bars
            label="What people open"
            rows={items.map((i) => ({
              label: DISCOVER_ITEM_LABELS[i.type] ?? i.type,
              value: i.opens,
              display: `${formatCount(i.opens)} opens · ${formatCount(i.people)} devices`,
            }))}
          />
        </Panel>
      </div>

      <Panel
        hint="Games that actually started"
        tag="reported"
        title="Top games"
      >
        <DataTable
          columns={[
            { key: "game", label: "Game" },
            { key: "launches", label: "Launches", align: "right" },
            { key: "players", label: "Devices", align: "right" },
          ]}
          empty="No game started in this period."
          rows={games.map((g) => ({
            key: g.game,
            cells: {
              game: gameName(g.game),
              launches: formatCount(g.launches),
              players: formatCount(g.players),
            },
          }))}
        />
      </Panel>
    </>
  );
}
