import type {
  ArticleReport,
  ConversionOutcomes,
  NewsEngagement,
  NewsMetrics,
  PartnerDay,
  RecentConversion,
  TopArticle,
} from "@news-spend-media/analytics";
import type { ReactNode } from "react";

import { ADMIN_PATH } from "./access";
import {
  describeChange,
  formatCount,
  formatDateTime,
  formatPercent,
} from "./format";
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

export function NewsKpis({ summary }: { summary: Summary }): ReactNode {
  const { current, previous } = summary;
  const versus = "vs previous period";
  return (
    <div className="ana-grid ana-kpis">
      <Kpi
        change={describeChange(current.views, previous.views)}
        label="Views"
        note={versus}
        tag="reported"
        value={formatCount(current.views)}
      />
      <Kpi
        change={describeChange(current.reads, previous.reads)}
        label="Qualified reads"
        note={versus}
        tag="reported"
        value={formatCount(current.reads)}
      />
      <Kpi
        label="Read rate"
        note="reads per view"
        tag="reported"
        value={formatPercent(current.readRate)}
      />
      <Kpi
        label="Click-through"
        note="views per impression"
        tag="reported"
        value={formatPercent(current.ctr)}
      />
      <Kpi
        change={describeChange(current.impressions, previous.impressions)}
        label="Impressions"
        note={versus}
        tag="reported"
        value={formatCount(current.impressions)}
      />
      <Kpi
        change={describeChange(current.shares, previous.shares)}
        label="Shares"
        note={versus}
        tag="reported"
        value={formatCount(current.shares)}
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
      hint="Each step as a share of the one before"
      tag="reported"
      title="From impression to read"
    >
      <Bars
        rows={[
          { label: "Impressions", value: current.impressions },
          {
            label: "Views",
            value: current.views,
            display: `${formatCount(current.views)} · ${formatPercent(current.ctr)}`,
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
  title = "Top articles",
  hint = "By views",
}: {
  articles: TopArticle[];
  title?: string;
  hint?: string;
}): ReactNode {
  return (
    <Panel hint={hint} tag="reported" title={title}>
      <DataTable
        columns={[
          { key: "article", label: "Article" },
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
            views: formatCount(a.views),
            reads: formatCount(a.reads),
            ctr: formatPercent(a.ctr),
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
        rows={categories.map((c) => ({ label: c.category, value: c.views }))}
      />
    </Panel>
  );
}

export function ArticleReportBody({
  report,
}: {
  report: ArticleReport;
}): ReactNode {
  return (
    <>
      <NewsKpis summary={report.summary} />
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

export function OutcomesPanel({
  current,
}: {
  current: ConversionOutcomes;
}): ReactNode {
  return (
    <Panel
      hint="Where the clicks made in this period ended up"
      tag="observed"
      title="Outcomes"
    >
      <Bars
        empty="No clicks in this period."
        rows={[
          { label: "Clicked, awaiting the partner", value: current.waiting },
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
        rows={[
          { label: "Views", value: shop.views },
          { label: "Clicks", value: shop.clicks },
        ]}
      />
    </Panel>
  );
}
