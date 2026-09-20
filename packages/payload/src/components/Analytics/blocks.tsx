import type {
  ArticleReport,
  ConversionOutcomes,
  GiveawayAttention,
  GiveawayReport,
  GiveawayState,
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
  formatDuration,
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
        note={state.live ? "entries open" : "entries closed"}
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
        rows={report.winners.byTier.map((t) => ({
          label: t.tier,
          value: t.winners,
        }))}
      />
      <div className="ana-muted">By claim</div>
      <Bars
        empty="No winners yet."
        rows={report.winners.byClaim.map((s) => ({
          label: s.status,
          value: s.winners,
        }))}
      />
      <div className="ana-muted">By fulfilment</div>
      <Bars
        empty="No winners yet."
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
