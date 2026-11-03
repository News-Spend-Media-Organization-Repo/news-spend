import { describe, expect, it } from "bun:test";

import { NOTIFICATION_DESTINATIONS } from "@news-spend-media/utils/appRoutes";

import {
  isRoutableNotificationPath,
  normaliseNotificationPath,
  parseNotificationDestination,
  resolveNotificationUrl,
  withArticleDestination,
  withScreenDestination,
  withWebDestination,
} from "../src/lib/notification-link";

describe("normaliseNotificationPath", () => {
  it("keeps the canonical app path", () => {
    expect(normaliseNotificationPath("article/some-slug")).toBe(
      "article/some-slug"
    );
  });

  it("folds a shared article link into an app path", () => {
    expect(
      normaliseNotificationPath("https://link.newsspend.com/article/some-slug")
    ).toBe("article/some-slug");
  });

  it("drops the legacy tab segment", () => {
    expect(normaliseNotificationPath("news/article/some-slug")).toBe(
      "article/some-slug"
    );
  });

  it("keeps a leading slash out", () => {
    expect(normaliseNotificationPath("/article/some-slug")).toBe(
      "article/some-slug"
    );
  });

  it("refuses anything that is not a path", () => {
    expect(normaliseNotificationPath(undefined)).toBeNull();
    expect(normaliseNotificationPath(42)).toBeNull();
    expect(normaliseNotificationPath("   ")).toBeNull();
  });
});

describe("isRoutableNotificationPath", () => {
  it.each([
    "article/some-slug",
    "article/some-slug/comment/c1/c2",
    "detail/some-slug",
    "prize/winner-1",
    "my-giveaways",
    "notification",
    "news",
    "discover",
    "article/some-slug?newsId=1",
  ])("routes %s", (path) => {
    expect(isRoutableNotificationPath(path)).toBe(true);
  });

  it.each([
    "",
    "https://newsspend.com/article/some-slug",
    "article",
    "my-prizes",
    "news/article/some-slug",
  ])("refuses %s", (path) => {
    expect(isRoutableNotificationPath(path)).toBe(false);
  });
});

describe("resolveNotificationUrl", () => {
  it("routes the path an operator set", () => {
    expect(resolveNotificationUrl({ url: "article/some-slug" })).toEqual({
      url: "article/some-slug",
    });
  });

  it("normalises a share link before sending it", () => {
    expect(
      resolveNotificationUrl({
        url: "https://link.newsspend.com/news/article/some-slug",
      })
    ).toEqual({ url: "article/some-slug" });
  });

  it("refuses a campaign with no destination", () => {
    expect(resolveNotificationUrl({})).toEqual({ error: "missing" });
  });

  it("accepts a web page with a real address", () => {
    expect(
      resolveNotificationUrl({ url: "browser?url=https%3A%2F%2Fexample.com" })
    ).toEqual({ url: "browser?url=https%3A%2F%2Fexample.com" });
  });

  it("refuses the browser screen without an address", () => {
    expect(resolveNotificationUrl({ url: "browser" })).toEqual({
      error: "unroutable",
    });
    expect(
      resolveNotificationUrl({ url: "browser?url=javascript:alert(1)" })
    ).toEqual({
      error: "unroutable",
    });
  });

  it("refuses a destination the app cannot open", () => {
    expect(resolveNotificationUrl({ url: "https://newsspend.com/x" })).toEqual({
      error: "unroutable",
    });
  });

  it("lets a producer say it could not resolve a target", () => {
    expect(resolveNotificationUrl({ url: null })).toBeNull();
  });
});

describe("parseNotificationDestination", () => {
  it("reads an article picked in the UI", () => {
    expect(
      parseNotificationDestination({
        url: "article/some-slug",
        newsId: "news-1",
        type: "news",
      })
    ).toEqual({
      target: "article",
      articleId: "news-1",
      articleSlug: "some-slug",
    });
  });

  it("reads an article link that only carries the slug", () => {
    expect(parseNotificationDestination({ url: "article/some-slug" })).toEqual({
      target: "article",
      articleId: undefined,
      articleSlug: "some-slug",
    });
  });

  it("reads a screen", () => {
    expect(parseNotificationDestination({ url: "play-lottery" })).toEqual({
      target: "screen",
      screen: "play-lottery",
    });
  });

  it("reads a web page back into the picker", () => {
    expect(
      parseNotificationDestination({
        url: "browser?url=https%3A%2F%2Fexample.com",
      })
    ).toEqual({ target: "web", url: "https://example.com" });
  });

  it("leaves links the picker does not model alone", () => {
    expect(
      parseNotificationDestination({
        url: "article/some-slug/comment/c1/c2",
        newsId: "news-1",
      })
    ).toBeUndefined();
    expect(parseNotificationDestination({ url: null })).toBeUndefined();
    expect(parseNotificationDestination({})).toBeUndefined();
  });
});

describe("destination writers", () => {
  it("writes an article without losing the other data keys", () => {
    expect(
      withArticleDestination(
        { source: "campaign" },
        { id: "news-1", slug: "some-slug" }
      )
    ).toEqual({
      source: "campaign",
      url: "article/some-slug",
      newsId: "news-1",
      type: "news",
    });
  });

  it("writes a web page with its url encoded", () => {
    expect(
      withWebDestination(
        { url: "article/some-slug", newsId: "news-1", source: "campaign" },
        " https://example.com/a b "
      )
    ).toEqual({
      url: "browser?url=https%3A%2F%2Fexample.com%2Fa%20b",
      source: "campaign",
      newsId: undefined,
    });
  });

  it("writes a screen and drops the article id", () => {
    expect(
      withScreenDestination(
        { url: "article/some-slug", newsId: "news-1", source: "campaign" },
        "support"
      )
    ).toEqual({ url: "support", source: "campaign", newsId: undefined });
  });
});

describe("notification picker destinations", () => {
  it("does not offer screens that need a url param", () => {
    const values = NOTIFICATION_DESTINATIONS.map(({ value }) => value);

    expect(values).not.toContain("browser");
    expect(values).not.toContain("survey");
  });
});
