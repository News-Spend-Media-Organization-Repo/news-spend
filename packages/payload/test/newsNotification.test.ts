import { describe, expect, it, mock } from "bun:test";
import { newsNotificationCopy } from "../src/hooks/news/notificationCopy";
import sendNotificationOnCreate from "../src/hooks/news/sendNotificationOnCreate";

const article = {
  title: "Lagos council approves new market",
  type: "article",
  excerpt: "The market opens next month",
};

describe("newsNotificationCopy", () => {
  it("falls back to the article title and excerpt", () => {
    expect(newsNotificationCopy(article)).toEqual({
      title: "Lagos council approves new market",
      body: "The market opens next month...",
    });
  });

  it("has a body when the article has no excerpt", () => {
    expect(newsNotificationCopy({ ...article, excerpt: null })?.body).toBe(
      "New news published!"
    );
  });

  it("uses the editor's title and body, trimmed", () => {
    expect(
      newsNotificationCopy({
        ...article,
        notificationTitle: "  BREAKING: Market approved  ",
        notificationBody: "  Council votes yes  ",
      })
    ).toEqual({
      title: "BREAKING: Market approved",
      body: "Council votes yes",
    });
  });

  it("ignores blank overrides and sends the article", () => {
    expect(
      newsNotificationCopy({
        ...article,
        notificationTitle: "   ",
        notificationBody: "",
      })
    ).toEqual({
      title: "Lagos council approves new market",
      body: "The market opens next month...",
    });
  });

  it("sends nothing when the editor switched the push off", () => {
    expect(
      newsNotificationCopy({
        ...article,
        sendNotification: false,
        notificationTitle: "BREAKING",
      })
    ).toBeNull();
  });
});

describe("sendNotificationOnCreate", () => {
  const published = {
    ...article,
    _status: "published",
    hasBeenPublished: false,
    slug: "market-approved",
    id: "news-1",
    notificationTitle: "BREAKING: Market approved",
    notificationBody: "Council votes yes",
  };

  const requestFor = () => {
    const create = mock(() => Promise.resolve({}));
    const update = mock(() => Promise.resolve({}));
    return {
      create,
      update,
      req: {
        payload: {
          create,
          update,
          logger: { error: mock(() => undefined) },
        },
      },
    };
  };

  it("sends the pushed copy and marks the article as published", async () => {
    const { req, create, update } = requestFor();

    await sendNotificationOnCreate({
      doc: { ...published },
      req,
    } as never);

    expect(create).toHaveBeenCalledTimes(1);
    const args = (create.mock.calls[0] as unknown[])[0] as {
      data: { title: string; body: string };
    };
    expect(args.data.title).toBe("BREAKING: Market approved");
    expect(args.data.body).toBe("Council votes yes");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("marks it as published without sending when the push is off", async () => {
    const { req, create, update } = requestFor();

    await sendNotificationOnCreate({
      doc: { ...published, sendNotification: false },
      req,
    } as never);

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a draft or a second save", async () => {
    for (const doc of [
      { ...published, _status: "draft" },
      { ...published, hasBeenPublished: true },
    ]) {
      const { req, create, update } = requestFor();

      await sendNotificationOnCreate({ doc, req } as never);

      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    }
  });
});
