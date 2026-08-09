import { updateAndroidWidget } from "@use-voltra/android-client";
import type { ScheduledWidgetEntry } from "@use-voltra/ios-client";
import { scheduleWidget, Voltra } from "@use-voltra/ios-client";
import { Platform } from "react-native";

import { client } from "#/lib/orpc";

const WIDGET_ID = "daily_digest";

/** Hours at which the digest greeting rolls over. */
const DIGEST_SLOT_HOURS = [7, 12, 17];

/**
 * Mirrors `widgetTheme` in packages/api/src/router/widgets/theme.ts. The client
 * schedules the same widget the server renders, so the two must agree or the
 * widget changes appearance depending on which path last wrote the timeline.
 */
const THEME = {
  surface: "#0E1B2A",
  textPrimary: "#FFFFFF",
  textSecondary: "#C9D1DC",
  textMuted: "#8A94A6",
  accent: "#4A90D9",
  hairline: "#24354A",
};

type NewsItem = {
  id: string;
  title: string;
  slug: string;
  category?: string;
};

function deepLink(item: NewsItem): string {
  return `news-spend://news/article/${item.slug}/${item.id}`;
}

/**
 * Renders the iOS daily digest widget for a given set of stories.
 * Layout intentionally matches the server-rendered digest.
 */
function renderDigestVariants(stories: NewsItem[], greeting: string) {
  const lead = stories[0];
  const rest = stories.slice(1, 3);
  const remaining = stories.length - 1;

  const eyebrow = (
    <Voltra.Text
      style={{ fontSize: 11, fontWeight: "600", color: THEME.accent }}
    >
      {greeting.toUpperCase()}
    </Voltra.Text>
  );

  return {
    systemSmall: (
      <Voltra.ZStack style={{ flex: 1, backgroundColor: THEME.surface }}>
        <Voltra.Link destination={lead ? deepLink(lead) : "news-spend://news"}>
          <Voltra.VStack spacing={10} style={{ padding: 16, flex: 1 }}>
            {eyebrow}
            {lead ? (
              <Voltra.Text
                numberOfLines={4}
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: THEME.textPrimary,
                }}
              >
                {lead.title}
              </Voltra.Text>
            ) : null}
            <Voltra.Spacer />
            {remaining > 0 ? (
              <Voltra.Text style={{ fontSize: 11, color: THEME.textMuted }}>
                {`+ ${remaining} more today`}
              </Voltra.Text>
            ) : null}
          </Voltra.VStack>
        </Voltra.Link>
      </Voltra.ZStack>
    ),
    systemMedium: (
      <Voltra.ZStack style={{ flex: 1, backgroundColor: THEME.surface }}>
        <Voltra.VStack spacing={10} style={{ padding: 16, flex: 1 }}>
          <Voltra.HStack style={{ alignItems: "center" }}>
            {eyebrow}
            <Voltra.Spacer />
            <Voltra.Text style={{ fontSize: 11, color: THEME.textMuted }}>
              {`${stories.length} new`}
            </Voltra.Text>
          </Voltra.HStack>

          {lead ? (
            <Voltra.Link destination={deepLink(lead)}>
              <Voltra.Text
                numberOfLines={2}
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: THEME.textPrimary,
                }}
              >
                {lead.title}
              </Voltra.Text>
            </Voltra.Link>
          ) : null}

          {rest.length > 0 ? (
            <Voltra.Divider style={{ backgroundColor: THEME.hairline }} />
          ) : null}

          <Voltra.VStack spacing={8}>
            {rest.map((item) => (
              <Voltra.Link destination={deepLink(item)} key={item.id}>
                <Voltra.Text
                  numberOfLines={1}
                  style={{ fontSize: 13, color: THEME.textSecondary }}
                >
                  {item.title}
                </Voltra.Text>
              </Voltra.Link>
            ))}
          </Voltra.VStack>
          <Voltra.Spacer />
        </Voltra.VStack>
      </Voltra.ZStack>
    ),
  };
}

type ArticleDoc = {
  id: string;
  title: string;
  slug: string;
  category?: { title?: string | null } | string | null;
};

/**
 * `news.all` returns a feed union — articles interleaved with ad and promo
 * entries, none of which carry a title. `includeAds: false` keeps them out at
 * runtime, but the return type stays a union, so narrow structurally.
 */
function isArticle(doc: unknown): doc is ArticleDoc {
  return (
    typeof doc === "object" &&
    doc !== null &&
    typeof (doc as ArticleDoc).id === "string" &&
    typeof (doc as ArticleDoc).title === "string" &&
    typeof (doc as ArticleDoc).slug === "string"
  );
}

function toWidgetItem(doc: unknown): NewsItem | null {
  if (!isArticle(doc)) {
    return null;
  }

  return {
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    category:
      typeof doc.category === "object"
        ? (doc.category?.title ?? undefined)
        : undefined,
  };
}

/**
 * Fetches recent news from the API for the digest widget.
 */
async function fetchNews(limit = 4): Promise<NewsItem[]> {
  const res = await client.news.all({ limit, includeAds: false });

  return res.docs
    .map(toWidgetItem)
    .filter((item): item is NewsItem => item !== null);
}

function greetingForHour(hour: number): string {
  if (hour < 12) {
    return "Good Morning";
  }
  if (hour < 17) {
    return "Good Afternoon";
  }
  return "Good Evening";
}

/**
 * Builds the chronological list of greeting changeovers in the next 24 hours.
 *
 * Each slot hour is expanded for both today and tomorrow, then filtered to the
 * future and sorted, so the timeline stays ordered no matter what time of day
 * the app is opened. WidgetKit requires entries in ascending date order.
 */
function upcomingDigestSlots(now: Date): Date[] {
  const slots: Date[] = [];

  for (const dayOffset of [0, 1]) {
    for (const hour of DIGEST_SLOT_HOURS) {
      const slot = new Date(now);
      slot.setDate(slot.getDate() + dayOffset);
      slot.setHours(hour, 0, 0, 0);
      if (slot > now) {
        slots.push(slot);
      }
    }
  }

  return slots
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, DIGEST_SLOT_HOURS.length);
}

/**
 * Schedules the daily digest widget on iOS with entries at each greeting
 * changeover. On Android, updates the widget with current content.
 */
export async function scheduleDailyDigest(): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return;
  }

  try {
    const stories = await fetchNews(4);
    if (stories.length === 0) {
      return;
    }

    const now = new Date();

    if (Platform.OS === "ios") {
      // The timeline opens with an entry for right now — without it the widget
      // renders its placeholder until the first future slot arrives — followed
      // by each upcoming greeting changeover, in order.
      const toEntry = (date: Date): ScheduledWidgetEntry => ({
        date,
        variants: renderDigestVariants(
          stories,
          greetingForHour(date.getHours())
        ),
        deepLinkUrl: "news-spend://news",
      });

      const entries: ScheduledWidgetEntry[] = [
        toEntry(now),
        ...upcomingDigestSlots(now).map(toEntry),
      ];

      await scheduleWidget(WIDGET_ID, entries);
    } else {
      const variants = renderDigestVariants(
        stories,
        greetingForHour(now.getHours())
      );

      await updateAndroidWidget(WIDGET_ID, [
        { size: { width: 150, height: 100 }, content: variants.systemSmall },
        { size: { width: 150, height: 200 }, content: variants.systemMedium },
      ]);
    }
  } catch (error) {
    console.warn("[Voltra] Failed to schedule daily digest:", error);
  }
}
