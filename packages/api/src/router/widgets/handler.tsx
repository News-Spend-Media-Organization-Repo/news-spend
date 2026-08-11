import { getPayload } from "@news-spend-media/payload";
import { renderAndroidWidgetToString } from "@use-voltra/android/server";
import { renderWidgetToString } from "@use-voltra/ios/server";
import { createWidgetUpdateHandler } from "@use-voltra/server";
import {
  MediumDailyDigestAndroid,
  SmallDailyDigestAndroid,
} from "./daily-digest-android";
import { DailyDigestIOS } from "./daily-digest-ios";
import {
  MediumTrendingNewsAndroid,
  SmallTrendingNewsAndroid,
} from "./trending-news-android";
import { TrendingNewsIOS } from "./trending-news-ios";
import {
  fetchDigestForWidget,
  fetchTrendingForWidget,
} from "./widget-data-fetchers";

function isKnownWidgetId(
  widgetId: string
): widgetId is "trending_news" | "daily_digest" {
  return widgetId === "trending_news" || widgetId === "daily_digest";
}

export const widgetHandler = createWidgetUpdateHandler({
  async renderIos({ widgetId }) {
    if (!isKnownWidgetId(widgetId)) {
      return null;
    }

    const payload = await getPayload();

    if (widgetId === "trending_news") {
      const news = await fetchTrendingForWidget(payload, 3);
      return renderWidgetToString({
        systemSmall: <TrendingNewsIOS family="systemSmall" news={news} />,
        systemMedium: <TrendingNewsIOS family="systemMedium" news={news} />,
      });
    }

    const digest = await fetchDigestForWidget(payload, 4);
    return renderWidgetToString({
      systemSmall: <DailyDigestIOS digest={digest} family="systemSmall" />,
      systemMedium: <DailyDigestIOS digest={digest} family="systemMedium" />,
    });
  },

  async renderAndroid({ widgetId }) {
    if (!isKnownWidgetId(widgetId)) {
      return null;
    }

    const payload = await getPayload();

    if (widgetId === "trending_news") {
      const news = await fetchTrendingForWidget(payload, 3);
      return renderAndroidWidgetToString([
        {
          size: { width: 150, height: 100 },
          content: <SmallTrendingNewsAndroid news={news} />,
        },
        {
          size: { width: 150, height: 200 },
          content: <MediumTrendingNewsAndroid news={news} />,
        },
      ]);
    }

    const digest = await fetchDigestForWidget(payload, 4);
    return renderAndroidWidgetToString([
      {
        size: { width: 150, height: 100 },
        content: <SmallDailyDigestAndroid digest={digest} />,
      },
      {
        size: { width: 150, height: 200 },
        content: <MediumDailyDigestAndroid digest={digest} />,
      },
    ]);
  },
});
