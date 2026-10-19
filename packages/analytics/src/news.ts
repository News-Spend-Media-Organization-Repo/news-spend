import type { SQL } from "@payloadcms/db-postgres/drizzle";
import { sql } from "@payloadcms/db-postgres/drizzle";

import type { AnalyticsDb } from "./db";
import { assertUuid, isoOrNull, percent, rowsOf } from "./db";
import type { DateWindow, Range } from "./range";
import { eachDay, inWindow } from "./range";
import type { AnalyticsScope } from "./scope";
import { requireStaff } from "./scope";

/**
 * Reader activity: what the app reports about articles.
 *
 * Everything here is *reported* by the app rather than confirmed by the server,
 * so it can be wrong by a device's clock or a modified client; the server
 * decides who and when (see the `track` endpoint) but not whether it happened.
 * It is whole-catalogue data, so it is staff only. A partner never sees it.
 */

export const PLATFORMS = ["android", "ios", "web"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type NewsFilter = {
  range: Range;
  platform?: Platform;
  /** Limits everything to one article. */
  articleId?: string;
};

/** The surfaces the app counts impressions on, in the order to show them. */
export const IMPRESSION_SURFACES = [
  "HomeFeed",
  "HomeTrending",
  "HomeRelated",
] as const;

export type NewsCounts = {
  impressions: number;
  views: number;
  reads: number;
  likes: number;
  dislikes: number;
  shares: number;
  /** Times the comments were opened, not comments written. */
  comments: number;
  /** Distinct devices that opened an article. */
  readers: number;
  /** Views whose device had been shown the article as an impression first. */
  matchedViews: number;
};

export type NewsMetrics = NewsCounts & {
  /**
   * Views with no impression before them (push, links, search): opens that
   * did not come through a feed the app counts impressions on.
   */
  directOpens: number;
  /**
   * Matched views per impression, as a percentage. Only views the device saw
   * as an impression first count, so this cannot exceed 100.
   */
  ctr: number | null;
  /** Reads per view, as a percentage. */
  readRate: number | null;
};

const EVENT_FIELD = {
  impression: "impressions",
  view: "views",
  read: "reads",
  like: "likes",
  dislike: "dislikes",
  share: "shares",
  comment: "comments",
} as const;

const emptyCounts = (): NewsCounts => ({
  impressions: 0,
  views: 0,
  reads: 0,
  likes: 0,
  dislikes: 0,
  shares: 0,
  comments: 0,
  readers: 0,
  matchedViews: 0,
});

/**
 * True for a view row `e` whose device had an impression of the same article
 * at or before it. Unbounded in time on purpose: the impression may fall
 * before the period starts.
 */
export const MATCHED_VIEW: SQL = sql`EXISTS (
  SELECT 1 FROM news_analytics i
  WHERE i.event = 'impression'
    AND i.article_id = e.article_id
    AND i.device_id = e.device_id
    AND i.timestamp <= e.timestamp
)`;

function withRatios(counts: NewsCounts): NewsMetrics {
  return {
    ...counts,
    directOpens: counts.views - counts.matchedViews,
    ctr: percent(counts.matchedViews, counts.impressions),
    readRate: percent(counts.reads, counts.views),
  };
}

function platformCondition(platform: Platform | undefined): SQL {
  if (platform === undefined) {
    return sql``;
  }
  if (!(PLATFORMS as readonly string[]).includes(platform)) {
    throw new RangeError(`platform must be one of ${PLATFORMS.join(", ")}`);
  }
  return sql`AND e.platform = ${platform}::enum_news_analytics_platform`;
}

function articleCondition(articleId: string | undefined): SQL {
  return articleId === undefined
    ? sql``
    : sql`AND e.article_id = ${assertUuid(articleId, "articleId")}::uuid`;
}

/** The WHERE clause shared by every event query in this file. */
function eventsWhere(filter: NewsFilter, window: DateWindow): SQL {
  return sql`${inWindow(sql.raw("e.timestamp"), window, filter.range.timeZone)}
    ${platformCondition(filter.platform)}
    ${articleCondition(filter.articleId)}`;
}

async function countsFor(
  db: AnalyticsDb,
  filter: NewsFilter,
  window: DateWindow
): Promise<NewsMetrics> {
  const rows = await rowsOf<{
    event: keyof typeof EVENT_FIELD;
    n: number;
    devices: number;
    matched: number;
  }>(
    db,
    sql`
      SELECT e.event::text AS event,
             COUNT(*)::int AS n,
             COUNT(DISTINCT e.device_id)::int AS devices,
             COUNT(*) FILTER (WHERE e.event = 'view' AND ${MATCHED_VIEW})::int AS matched
      FROM news_analytics e
      WHERE ${eventsWhere(filter, window)}
      GROUP BY e.event
    `
  );

  const counts = emptyCounts();
  for (const row of rows) {
    const field = EVENT_FIELD[row.event];
    if (field) {
      counts[field] = row.n;
    }
    if (row.event === "view") {
      counts.readers = row.devices;
      counts.matchedViews = row.matched;
    }
  }
  return withRatios(counts);
}

/** The headline numbers for the period, and for the period before it. */
export async function newsSummary(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: NewsFilter
): Promise<{ current: NewsMetrics; previous: NewsMetrics }> {
  requireStaff(scope);
  const [current, previous] = await Promise.all([
    countsFor(db, filter, filter.range.current),
    countsFor(db, filter, filter.range.previous),
  ]);
  return { current, previous };
}

export type NewsDay = {
  date: string;
  impressions: number;
  views: number;
  reads: number;
};

/** One row per day of the period, days with no events included as zeros. */
export async function newsDaily(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: NewsFilter
): Promise<NewsDay[]> {
  requireStaff(scope);
  const { timeZone, current } = filter.range;

  const rows = await rowsOf<{ day: string; event: string; n: number }>(
    db,
    sql`
      SELECT to_char((e.timestamp AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
             e.event::text AS event,
             COUNT(*)::int AS n
      FROM news_analytics e
      WHERE ${eventsWhere(filter, current)}
        AND e.event IN ('impression', 'view', 'read')
      GROUP BY 1, 2
    `
  );

  const byDay = new Map<string, NewsDay>(
    eachDay(current).map((date) => [
      date,
      { date, impressions: 0, views: 0, reads: 0 },
    ])
  );
  for (const row of rows) {
    const day = byDay.get(row.day);
    const field = EVENT_FIELD[row.event as keyof typeof EVENT_FIELD];
    if (
      day &&
      (field === "impressions" || field === "views" || field === "reads")
    ) {
      day[field] = row.n;
    }
  }
  return [...byDay.values()];
}

/**
 * Impressions by where the article was shown. The known surfaces are always
 * present, as zero when nothing was recorded there; anything else the app
 * reports is grouped as `other`.
 */
export async function newsSurfaces(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: NewsFilter
): Promise<{ surface: string; impressions: number }[]> {
  requireStaff(scope);

  const rows = await rowsOf<{ surface: string; n: number }>(
    db,
    sql`
      SELECT COALESCE(e.metadata->>'screen', 'unknown') AS surface,
             COUNT(*)::int AS n
      FROM news_analytics e
      WHERE ${eventsWhere(filter, filter.range.current)}
        AND e.event = 'impression'
      GROUP BY 1
    `
  );

  const known = new Set<string>(IMPRESSION_SURFACES);
  const result = IMPRESSION_SURFACES.map((surface) => ({
    surface: surface as string,
    impressions: rows.find((r) => r.surface === surface)?.n ?? 0,
  }));
  const other = rows
    .filter((r) => !known.has(r.surface))
    .reduce((sum, r) => sum + r.n, 0);
  return other > 0
    ? [...result, { surface: "other", impressions: other }]
    : result;
}

/** Views and reads by the platform they came from. */
export async function newsPlatforms(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: NewsFilter
): Promise<{ platform: string; views: number; reads: number }[]> {
  requireStaff(scope);

  return await rowsOf<{ platform: string; views: number; reads: number }>(
    db,
    sql`
      SELECT COALESCE(e.platform::text, 'unknown') AS platform,
             COUNT(*) FILTER (WHERE e.event = 'view')::int AS views,
             COUNT(*) FILTER (WHERE e.event = 'read')::int AS reads
      FROM news_analytics e
      WHERE ${eventsWhere(filter, filter.range.current)}
        AND e.event IN ('view', 'read')
      GROUP BY 1
      ORDER BY views DESC
    `
  );
}

export type NewsEngagement = {
  likes: number;
  dislikes: number;
  shares: number;
  comments: number;
  /** Shares by the method used, most used first. */
  shareMethods: { method: string; shares: number }[];
};

export async function newsEngagement(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: NewsFilter
): Promise<NewsEngagement> {
  requireStaff(scope);

  const [totals, methods] = await Promise.all([
    countsFor(db, filter, filter.range.current),
    rowsOf<{ method: string; shares: number }>(
      db,
      sql`
        SELECT COALESCE(e.metadata->>'shareMethod', 'unknown') AS method,
               COUNT(*)::int AS shares
        FROM news_analytics e
        WHERE ${eventsWhere(filter, filter.range.current)}
          AND e.event = 'share'
        GROUP BY 1
        ORDER BY shares DESC, method
      `
    ),
  ]);

  return {
    likes: totals.likes,
    dislikes: totals.dislikes,
    shares: totals.shares,
    comments: totals.comments,
    shareMethods: methods,
  };
}

/**
 * How much of the period's data comes from app versions that send no event id,
 * and so are stored without protection against being counted twice.
 */
export async function newsEventQuality(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: NewsFilter
): Promise<{ events: number; eventsWithoutId: number }> {
  requireStaff(scope);

  const [row] = await rowsOf<{ events: number; events_without_id: number }>(
    db,
    sql`
      SELECT COUNT(*)::int AS events,
             COUNT(*) FILTER (WHERE e.event_id IS NULL)::int AS events_without_id
      FROM news_analytics e
      WHERE ${eventsWhere(filter, filter.range.current)}
    `
  );
  return {
    events: row?.events ?? 0,
    eventsWithoutId: row?.events_without_id ?? 0,
  };
}

/** The ways the top-articles list can be ranked, the first being the default. */
export const TOP_SORTS = [
  "readers",
  "reads",
  "views",
  "impressions",
  "rising",
] as const;
export type TopSort = (typeof TOP_SORTS)[number];

/**
 * One fixed ORDER BY per sort, so caller input never reaches the text. Each
 * ends in the article id, so articles that tie never swap places between loads.
 */
const SORT_ORDER: Record<TopSort, SQL> = {
  readers: sql.raw("readers DESC, reads DESC, views DESC, n.id"),
  reads: sql.raw("reads DESC, readers DESC, views DESC, n.id"),
  views: sql.raw("views DESC, readers DESC, n.id"),
  impressions: sql.raw("impressions DESC, views DESC, n.id"),
  rising: sql.raw("trend DESC, views DESC, n.id"),
};

/** The fewest views an article needs in the period to be ranked as rising. */
const RISING_MIN_VIEWS = 3;

export type TopArticle = {
  id: string;
  title: string | null;
  slug: string | null;
  category: string | null;
  publishedAt: string | null;
  impressions: number;
  views: number;
  reads: number;
  /** Distinct devices that opened the article. */
  readers: number;
  /** Views with no impression from the same device before them. */
  directOpens: number;
  ctr: number | null;
  readRate: number | null;
  /**
   * How much busier the last two days were than an average two days of the
   * period. Set only when ranking by `rising`.
   */
  trend: number | null;
};

/** The articles ranked highest in the period, by unique readers unless told otherwise. */
export async function newsTopArticles(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: Omit<NewsFilter, "articleId"> & { limit?: number; sortBy?: TopSort }
): Promise<TopArticle[]> {
  requireStaff(scope);
  const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 10), 1), 50);
  const sortBy = filter.sortBy ?? "readers";
  const order = SORT_ORDER[sortBy];
  if (!order) {
    throw new RangeError(`sortBy must be one of ${TOP_SORTS.join(", ")}`);
  }

  const { current, timeZone, days } = filter.range;
  const rising = sortBy === "rising";
  const lastTwoDays = sql`e.timestamp >= (((${current.to}::date - 1)::timestamp) AT TIME ZONE ${timeZone})`;
  const trend = rising
    ? sql`ROUND(
        (COUNT(*) FILTER (WHERE e.event = 'view' AND ${lastTwoDays}) * ${days}::numeric
          / (2 * NULLIF(COUNT(*) FILTER (WHERE e.event = 'view'), 0)))::numeric, 2
      )::float8`
    : sql`NULL::float8`;
  const having = rising
    ? sql`HAVING COUNT(*) FILTER (WHERE e.event = 'view') >= ${RISING_MIN_VIEWS}`
    : sql``;

  const rows = await rowsOf<{
    id: string;
    title: string | null;
    slug: string | null;
    category: string | null;
    published_at: unknown;
    impressions: number;
    views: number;
    reads: number;
    readers: number;
    matched_views: number;
    trend: number | null;
  }>(
    db,
    sql`
      SELECT n.id, n.title, n.slug, c.title AS category, n.published_at,
             COUNT(*) FILTER (WHERE e.event = 'impression')::int AS impressions,
             COUNT(*) FILTER (WHERE e.event = 'view')::int AS views,
             COUNT(*) FILTER (WHERE e.event = 'read')::int AS reads,
             COUNT(DISTINCT e.device_id) FILTER (WHERE e.event = 'view')::int AS readers,
             COUNT(*) FILTER (WHERE e.event = 'view' AND ${MATCHED_VIEW})::int AS matched_views,
             ${trend} AS trend
      FROM news_analytics e
      JOIN news n ON n.id = e.article_id
      LEFT JOIN categories c ON c.id = n.category_id
      WHERE ${eventsWhere(filter, current)}
        AND e.event IN ('impression', 'view', 'read')
      GROUP BY n.id, c.title
      ${having}
      ORDER BY ${order}
      LIMIT ${limit}
    `
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    category: r.category,
    publishedAt: isoOrNull(r.published_at),
    impressions: r.impressions,
    views: r.views,
    reads: r.reads,
    readers: r.readers,
    directOpens: r.views - r.matched_views,
    ctr: percent(r.matched_views, r.impressions),
    readRate: percent(r.reads, r.views),
    trend: r.trend,
  }));
}

/** Views, reads and impressions by category, most viewed first. */
export async function newsTopCategories(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  filter: Omit<NewsFilter, "articleId"> & { limit?: number }
): Promise<
  { category: string; impressions: number; views: number; reads: number }[]
> {
  requireStaff(scope);
  const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 5), 1), 20);

  return await rowsOf(
    db,
    sql`
      SELECT COALESCE(c.title, 'Uncategorised') AS category,
             COUNT(*) FILTER (WHERE e.event = 'impression')::int AS impressions,
             COUNT(*) FILTER (WHERE e.event = 'view')::int AS views,
             COUNT(*) FILTER (WHERE e.event = 'read')::int AS reads
      FROM news_analytics e
      JOIN news n ON n.id = e.article_id
      LEFT JOIN categories c ON c.id = n.category_id
      WHERE ${eventsWhere(filter, filter.range.current)}
        AND e.event IN ('impression', 'view', 'read')
      GROUP BY c.id, c.title
      ORDER BY views DESC, category
      LIMIT ${limit}
    `
  );
}

export type ArticleReport = {
  article: {
    id: string;
    title: string | null;
    slug: string | null;
    publishedAt: string | null;
  } | null;
  summary: { current: NewsMetrics; previous: NewsMetrics };
  daily: NewsDay[];
  surfaces: { surface: string; impressions: number }[];
  platforms: { platform: string; views: number; reads: number }[];
  engagement: NewsEngagement;
};

/** Everything the article's Stats tab shows, in one call. */
export async function newsArticleReport(
  db: AnalyticsDb,
  scope: AnalyticsScope,
  articleId: string,
  filter: Omit<NewsFilter, "articleId">
): Promise<ArticleReport> {
  requireStaff(scope);
  const scoped: NewsFilter = { ...filter, articleId };

  const [meta, summary, daily, surfaces, platforms, engagement] =
    await Promise.all([
      rowsOf<{
        id: string;
        title: string | null;
        slug: string | null;
        published_at: unknown;
      }>(
        db,
        sql`SELECT id, title, slug, published_at FROM news WHERE id = ${assertUuid(articleId, "articleId")}::uuid`
      ),
      newsSummary(db, scope, scoped),
      newsDaily(db, scope, scoped),
      newsSurfaces(db, scope, scoped),
      newsPlatforms(db, scope, scoped),
      newsEngagement(db, scope, scoped),
    ]);

  const row = meta[0];
  return {
    article: row
      ? {
          id: row.id,
          title: row.title,
          slug: row.slug,
          publishedAt: isoOrNull(row.published_at),
        }
      : null,
    summary,
    daily,
    surfaces,
    platforms,
    engagement,
  };
}
