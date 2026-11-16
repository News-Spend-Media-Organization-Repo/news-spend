import { describe, expect, it, mock } from "bun:test";
import {
  firstKeyPoint,
  newsNotificationCopy,
  suggestedNotificationCopy,
  truncateForPush,
} from "../src/hooks/news/notificationCopy";
import { prefillNotificationCopy } from "../src/hooks/news/prefillNotificationCopy";
import { requireKeyPointToPublish } from "../src/hooks/news/requireKeyPointToPublish";
import sendNotificationOnCreate from "../src/hooks/news/sendNotificationOnCreate";

const CUT_MID_WORD = /wor…$/;

const article = {
  title: "Lagos council approves new market",
  type: "article",
  keyPoints: [{ point: "The market opens next month" }],
};

describe("newsNotificationCopy", () => {
  it("falls back to the article title and its first key point", () => {
    expect(newsNotificationCopy(article)).toEqual({
      title: "Lagos council approves new market",
      body: "The market opens next month",
    });
  });

  it("has a body when the article has no key point", () => {
    expect(newsNotificationCopy({ ...article, keyPoints: [] })?.body).toBe(
      "New news published!"
    );
    expect(
      newsNotificationCopy({ ...article, keyPoints: [{ point: "  " }] })?.body
    ).toBe("New news published!");
  });

  it("no longer uses the auto-generated excerpt", () => {
    expect(
      newsNotificationCopy({
        ...article,
        keyPoints: [],
        excerpt: "First hundred characters of the body",
      } as never)?.body
    ).toBe("New news published!");
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

  it("puts the push prefix in front of the title", () => {
    expect(
      newsNotificationCopy({ ...article, notificationKicker: "JUST IN" })
    ).toEqual({
      title: "JUST IN: Lagos council approves new market",
      body: "The market opens next month",
    });
  });

  it("does not double the colon when the prefix already has one", () => {
    expect(
      newsNotificationCopy({ ...article, notificationKicker: "JUST IN: " })
        ?.title
    ).toBe("JUST IN: Lagos council approves new market");
  });

  it("leaves the title alone when the prefix is blank", () => {
    expect(
      newsNotificationCopy({ ...article, notificationKicker: "  " })?.title
    ).toBe("Lagos council approves new market");
  });

  it("prefixes an edited title too", () => {
    expect(
      newsNotificationCopy({
        ...article,
        notificationKicker: "BREAKING",
        notificationTitle: "Market approved",
      })?.title
    ).toBe("BREAKING: Market approved");
  });

  it("keeps the prefix and cuts a long headline at the push limit", () => {
    const title = newsNotificationCopy({
      ...article,
      title: "Long headline ".repeat(20),
      notificationKicker: "JUST IN",
    })?.title;

    expect(title?.startsWith("JUST IN: Long headline")).toBe(true);
    expect(title?.length).toBeLessThanOrEqual(120);
    expect(title?.endsWith("…")).toBe(true);
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
      body: "The market opens next month",
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
    // The editor must not wait for the send.
    expect((create.mock.calls[0] as unknown[])[0]).toMatchObject({
      context: { deferSend: true },
    });
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

describe("suggested push copy", () => {
  it("takes the first key point that has text", () => {
    expect(
      firstKeyPoint({
        keyPoints: [
          { point: " " },
          { point: null },
          { point: " Second " },
          { point: "Third" },
        ],
      })
    ).toBe("Second");
    expect(firstKeyPoint({ keyPoints: null })).toBeNull();
    expect(firstKeyPoint({})).toBeNull();
  });

  it("uses the headline as the title and the first key point as the body", () => {
    expect(suggestedNotificationCopy(article)).toEqual({
      title: "Lagos council approves new market",
      body: "The market opens next month",
    });
    expect(suggestedNotificationCopy({ title: "Headline" })).toEqual({
      title: "Headline",
      body: "",
    });
  });

  it("fits long text into the push limits, cutting at a word", () => {
    const long = "word ".repeat(60);
    const body = suggestedNotificationCopy({
      title: long,
      keyPoints: [{ point: long }],
    });

    expect(body.title.length).toBeLessThanOrEqual(120);
    expect(body.body.length).toBeLessThanOrEqual(150);
    expect(body.title.endsWith("…")).toBe(true);
    expect(body.title).not.toMatch(CUT_MID_WORD);
    expect(truncateForPush("short", 10)).toBe("short");
    expect(truncateForPush("  spaced \n out  ", 50)).toBe("spaced out");
  });
});

describe("prefillNotificationCopy", () => {
  const run = (data: Record<string, unknown>, originalDoc?: unknown) =>
    prefillNotificationCopy({ data, originalDoc } as never) as Record<
      string,
      unknown
    >;

  it("fills blank push fields on a new article", () => {
    const out = run({ ...article, _status: "draft" });

    expect(out.notificationTitle).toBe("Lagos council approves new market");
    expect(out.notificationBody).toBe("The market opens next month");
  });

  it("follows later edits to the headline and first key point", () => {
    const saved = {
      ...article,
      notificationTitle: "Lagos council approves new market",
      notificationBody: "The market opens next month",
    };
    const out = run(
      {
        ...saved,
        title: "Council approves Lekki market",
        keyPoints: [{ point: "Stalls open in December" }],
      },
      saved
    );

    expect(out.notificationTitle).toBe("Council approves Lekki market");
    expect(out.notificationBody).toBe("Stalls open in December");
  });

  it("leaves a field the editor changed alone", () => {
    const saved = {
      ...article,
      notificationTitle: "Lagos council approves new market",
      notificationBody: "The market opens next month",
    };
    const out = run(
      {
        ...saved,
        notificationTitle: "BREAKING: Market approved",
        title: "A new headline",
      },
      saved
    );

    expect(out.notificationTitle).toBe("BREAKING: Market approved");
    expect(out.notificationBody).toBe("The market opens next month");
  });

  it("does nothing once the article has been published", () => {
    const out = run(
      { ...article, notificationTitle: "", notificationBody: "" },
      { ...article, hasBeenPublished: true }
    );

    expect(out.notificationTitle).toBe("");
    expect(out.notificationBody).toBe("");
  });

  it("does nothing when the push is off or the news is not an article", () => {
    expect(run({ ...article, sendNotification: false }).notificationTitle).toBe(
      undefined
    );
    expect(run({ ...article, type: "video" }).notificationTitle).toBe(
      undefined
    );
  });
});

describe("publishing straight away, with no draft saved first", () => {
  it("fills the push fields in the same save, and that is what is sent", () => {
    const data = { ...article, _status: "published" } as Record<
      string,
      unknown
    >;

    // First save of a brand-new article: no original document yet.
    expect(() =>
      requireKeyPointToPublish({ data, originalDoc: undefined } as never)
    ).not.toThrow();
    const saved = prefillNotificationCopy({
      data,
      originalDoc: undefined,
    } as never) as Record<string, unknown>;

    expect(saved.notificationTitle).toBe("Lagos council approves new market");
    expect(saved.notificationBody).toBe("The market opens next month");
    expect(newsNotificationCopy(saved as never)).toEqual({
      title: "Lagos council approves new market",
      body: "The market opens next month",
    });
  });

  it("still sends the same copy if the fields were never prefilled", () => {
    expect(
      newsNotificationCopy({ ...article, _status: "published" } as never)
    ).toEqual({
      title: "Lagos council approves new market",
      body: "The market opens next month",
    });
  });
});

describe("requireKeyPointToPublish", () => {
  const run = (data: Record<string, unknown>, originalDoc?: unknown) =>
    requireKeyPointToPublish({ data, originalDoc } as never);

  const published = { ...article, _status: "published" };

  it("lets an article with a key point publish", () => {
    expect(() => run(published)).not.toThrow();
  });

  it("refuses to publish a new article with none, naming the field", () => {
    for (const keyPoints of [
      undefined,
      [],
      [{ point: "" }],
      [{ point: "  " }],
    ]) {
      let error: { data?: { errors?: { path: string }[] } } | undefined;
      try {
        run({ ...published, keyPoints });
      } catch (caught) {
        error = caught as typeof error;
      }

      expect(error).toBeDefined();
      expect(error?.data?.errors?.[0]?.path).toBe("keyPoints");
    }
  });

  it("uses the saved key points when the update does not carry them", () => {
    expect(() =>
      run(
        { _status: "published" },
        { type: "article", keyPoints: [{ point: "Saved" }] }
      )
    ).not.toThrow();
  });

  it("never blocks a draft", () => {
    expect(() =>
      run({ ...article, keyPoints: [], _status: "draft" })
    ).not.toThrow();
  });

  it("never blocks editing an article that was already published", () => {
    expect(() =>
      run({ ...published, keyPoints: [] }, { hasBeenPublished: true })
    ).not.toThrow();
  });

  it("leaves other types to their own rules", () => {
    expect(() =>
      run({ title: "x", type: "video", _status: "published", keyPoints: [] })
    ).not.toThrow();
  });
});
