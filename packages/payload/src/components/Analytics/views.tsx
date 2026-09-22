import type { Platform } from "@news-spend-media/analytics";
import {
  AnalyticsAccessError,
  giveawayReport,
  IMPRESSION_DEFINITION,
  newsArticleReport,
  newsDaily,
  newsEngagement,
  newsNotices,
  newsPlatforms,
  newsSummary,
  newsSurfaces,
  newsTopArticles,
  newsTopCategories,
  partnerDaily,
  partnerPostbackHealth,
  partnerRecentConversions,
  partnerSummary,
  READ_DEFINITION,
  resolveRange,
} from "@news-spend-media/analytics";
import type { AdminViewServerProps, DocumentViewServerProps } from "payload";
import type { ReactNode } from "react";

import {
  ADMIN_PATH,
  ANALYTICS_TIME_ZONE,
  dbOf,
  scopeOfRequest,
} from "./access";
import {
  ArticleReportBody,
  CategoriesPanel,
  EngagementPanel,
  FunnelPanel,
  GiveawayReportBody,
  NewsKpis,
  OutcomesPanel,
  PartnerDailyPanel,
  PartnerKpis,
  PlatformsPanel,
  PostbackHealthPanel,
  RecentConversionsPanel,
  ShopPanel,
  StepsPanel,
  SurfacesPanel,
  TopArticlesPanel,
} from "./blocks";
import type { Days } from "./params";
import { parseAnalyticsParams } from "./params";
import { Denied, Notices, Problem, Segmented, Styles } from "./ui";

/**
 * The analytics screens. Each one starts by working out what the signed-in user
 * may see and stops there if the answer is "nothing": custom admin views are
 * reachable by address whether or not their tab is shown, so hiding a tab is
 * never the protection.
 */

function Toolbar({
  basePath,
  days,
  platform,
  showPlatform,
}: {
  basePath: string;
  days: Days;
  platform?: Platform;
  showPlatform: boolean;
}): ReactNode {
  const href = (next: { days?: Days; platform?: Platform | null }) => {
    const query = new URLSearchParams({ days: String(next.days ?? days) });
    const chosen = next.platform === undefined ? platform : next.platform;
    if (chosen) {
      query.set("platform", chosen);
    }
    return `${basePath}?${query}`;
  };

  return (
    <div className="ana-controls">
      <Segmented
        links={([7, 30, 90] as const).map((d) => ({
          label: `${d} days`,
          href: href({ days: d }),
          current: d === days,
        }))}
      />
      {showPlatform ? (
        <Segmented
          links={[
            {
              label: "All",
              href: href({ platform: null }),
              current: !platform,
            },
            {
              label: "iOS",
              href: href({ platform: "ios" }),
              current: platform === "ios",
            },
            {
              label: "Android",
              href: href({ platform: "android" }),
              current: platform === "android",
            },
          ]}
        />
      ) : null}
    </div>
  );
}

function Header({
  title,
  hint,
  toolbar,
}: {
  title: string;
  hint: string;
  toolbar: ReactNode;
}): ReactNode {
  return (
    <div className="ana-head">
      <div>
        <h2>{title}</h2>
        <div className="ana-muted">{hint}</div>
      </div>
      {toolbar}
    </div>
  );
}

const ZONE_NOTE = "Days are Lagos time.";

/**
 * Runs a loader, turning "not allowed" and "bad input" into a screen rather
 * than a crash. Anything else is a real fault and is left to be reported.
 */
async function guarded(load: () => Promise<ReactNode>): Promise<ReactNode> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AnalyticsAccessError) {
      return <Denied />;
    }
    if (error instanceof RangeError) {
      return <Problem message={error.message} />;
    }
    throw error;
  }
}

/** The Stats tab on an article. */
export async function ArticleStatsView(
  props: DocumentViewServerProps
): Promise<ReactNode> {
  const { req, docID } = props.initPageResult;
  const scope = scopeOfRequest(req);
  if (scope?.kind !== "staff") {
    return <Denied />;
  }

  return await guarded(async () => {
    const { days, platform } = parseAnalyticsParams(props.searchParams);
    const range = resolveRange({ days, timeZone: ANALYTICS_TIME_ZONE });
    const id = String(docID ?? props.doc?.id ?? "");
    const report = await newsArticleReport(dbOf(req), scope, id, {
      range,
      platform,
    });

    return (
      <>
        <Styles />
        <div className="ana ana-page">
          <Header
            hint={`${report.article?.title ?? "This article"}. ${ZONE_NOTE} ${READ_DEFINITION}`}
            title="Article stats"
            toolbar={
              <Toolbar
                basePath={`${ADMIN_PATH}/collections/news/${id}/stats`}
                days={days}
                platform={platform}
                showPlatform
              />
            }
          />
          <Notices notices={newsNotices(range)} />
          <ArticleReportBody report={report} />
        </div>
      </>
    );
  });
}

/** The full analytics page, at /admin/analytics. */
export async function AnalyticsPageView(
  props: AdminViewServerProps
): Promise<ReactNode> {
  const { req } = props.initPageResult;
  const scope = scopeOfRequest(req);
  if (scope?.kind !== "staff") {
    return <Denied />;
  }

  return await guarded(async () => {
    const { days, platform } = parseAnalyticsParams(props.searchParams);
    const range = resolveRange({ days, timeZone: ANALYTICS_TIME_ZONE });
    const db = dbOf(req);
    const filter = { range, platform };

    const [summary, daily, surfaces, platforms, engagement, top, categories] =
      await Promise.all([
        newsSummary(db, scope, filter),
        newsDaily(db, scope, filter),
        newsSurfaces(db, scope, filter),
        newsPlatforms(db, scope, filter),
        newsEngagement(db, scope, filter),
        newsTopArticles(db, scope, { ...filter, limit: 10 }),
        newsTopCategories(db, scope, { ...filter, limit: 8 }),
      ]);

    return (
      <>
        <Styles />
        <div className="ana ana-page">
          <Header
            hint={`How readers find, open and finish articles. ${ZONE_NOTE} ${IMPRESSION_DEFINITION} ${READ_DEFINITION}`}
            title="Analytics"
            toolbar={
              <Toolbar
                basePath={`${ADMIN_PATH}/analytics`}
                days={days}
                platform={platform}
                showPlatform
              />
            }
          />
          <Notices notices={newsNotices(range)} />
          <NewsKpis summary={summary} />
          <div className="ana-grid ana-two">
            <FunnelPanel days={daily} />
            <SurfacesPanel surfaces={surfaces} />
          </div>
          <div className="ana-grid ana-two">
            <TopArticlesPanel articles={top} />
            <StepsPanel current={summary.current} />
          </div>
          <div className="ana-grid ana-even">
            <PlatformsPanel platforms={platforms} />
            <CategoriesPanel categories={categories} />
          </div>
          <EngagementPanel engagement={engagement} />
        </div>
      </>
    );
  });
}

/**
 * The Performance tab on a partner. A partner is shown their own whatever
 * address they used; staff see the partner whose document this is.
 */
export async function PartnerPerformanceView(
  props: DocumentViewServerProps
): Promise<ReactNode> {
  const { req, docID } = props.initPageResult;
  const scope = scopeOfRequest(req);
  if (!scope) {
    return <Denied />;
  }

  return await guarded(async () => {
    const { days } = parseAnalyticsParams(props.searchParams);
    const range = resolveRange({ days, timeZone: ANALYTICS_TIME_ZONE });
    const db = dbOf(req);
    const id = String(docID ?? props.doc?.id ?? "");
    const filter = { range, partnerId: id };

    const [summary, daily, recent, postbacks] = await Promise.all([
      partnerSummary(db, scope, filter),
      partnerDaily(db, scope, filter),
      partnerRecentConversions(db, scope, { partnerId: id, limit: 10 }),
      partnerPostbackHealth(db, scope, filter),
    ]);

    return (
      <>
        <Styles />
        <div className="ana ana-page">
          <Header
            hint={`Conversions are confirmed by the partner's postback. Shop views are reported by the app. ${ZONE_NOTE}`}
            title="Performance"
            toolbar={
              <Toolbar
                basePath={`${ADMIN_PATH}/collections/partners/${id}/performance`}
                days={days}
                showPlatform={false}
              />
            }
          />
          <PartnerKpis
            current={summary.conversions.current}
            previous={summary.conversions.previous}
          />
          <div className="ana-grid ana-two">
            <PartnerDailyPanel days={daily} />
            <OutcomesPanel current={summary.conversions.current} />
          </div>
          <div className="ana-grid ana-two">
            <RecentConversionsPanel
              rows={recent}
              showPartner={false}
              timeZone={ANALYTICS_TIME_ZONE}
            />
            <div className="ana-stack">
              <PostbackHealthPanel
                health={postbacks}
                timeZone={ANALYTICS_TIME_ZONE}
                waiting={summary.conversions.current.waiting}
              />
              <ShopPanel shop={summary.shop.current} />
            </div>
          </div>
        </div>
      </>
    );
  });
}

/** The Stats tab on a giveaway. Staff only. */
export async function GiveawayStatsView(
  props: DocumentViewServerProps
): Promise<ReactNode> {
  const { req, docID } = props.initPageResult;
  const scope = scopeOfRequest(req);
  if (scope?.kind !== "staff") {
    return <Denied />;
  }

  return await guarded(async () => {
    const { days } = parseAnalyticsParams(props.searchParams);
    const range = resolveRange({ days, timeZone: ANALYTICS_TIME_ZONE });
    const id = String(docID ?? props.doc?.id ?? "");
    const report = await giveawayReport(dbOf(req), scope, id, { range });

    return (
      <>
        <Styles />
        <div className="ana ana-page">
          <Header
            hint={`${report.state?.name ?? "This giveaway"}. ${ZONE_NOTE} Everything here is observed: rows the server created.`}
            title="Giveaway stats"
            toolbar={
              <Toolbar
                basePath={`${ADMIN_PATH}/collections/giveaways/${id}/stats`}
                days={days}
                showPlatform={false}
              />
            }
          />
          <GiveawayReportBody report={report} timeZone={ANALYTICS_TIME_ZONE} />
        </div>
      </>
    );
  });
}
