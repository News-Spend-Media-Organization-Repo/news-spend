import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import { createFakePayload, expectError, mockContext } from "../../test-utils";
import { newsRouter } from "./index";

function makeNews(overrides = {}) {
  return {
    id: "news-1",
    slug: "test-article",
    title: "Test Article",
    type: "article",
    _status: "published",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("newsRouter.search", () => {
  it("matches title words case-insensitively", async () => {
    const payload = createFakePayload({
      collections: {
        news: [
          makeNews({ id: "n1", title: "Fuel price rises again" }),
          makeNews({ id: "n2", title: "Election results announced" }),
        ],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      newsRouter.search,
      { q: "FUEL" },
      { context: ctx }
    );

    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]).toMatchObject({ id: "n1" });
  });

  it("requires every word to appear in the title", async () => {
    const payload = createFakePayload({
      collections: {
        news: [
          makeNews({ id: "n1", title: "Fuel price rises again" }),
          makeNews({ id: "n2", title: "Fuel subsidy removed" }),
        ],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      newsRouter.search,
      { q: "fuel rises" },
      { context: ctx }
    );

    expect(result.docs.map((doc) => doc.id)).toEqual(["n1"]);
  });

  it("excludes unpublished and non-article documents", async () => {
    const payload = createFakePayload({
      collections: {
        news: [
          makeNews({ id: "published", title: "Fuel price" }),
          makeNews({
            id: "draft",
            title: "Fuel price draft",
            _status: "draft",
          }),
          makeNews({ id: "video", title: "Fuel price video", type: "video" }),
        ],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      newsRouter.search,
      { q: "fuel" },
      { context: ctx }
    );

    expect(result.docs.map((doc) => doc.id)).toEqual(["published"]);
  });

  it("filters by category", async () => {
    const payload = createFakePayload({
      collections: {
        news: [
          makeNews({
            id: "politics",
            title: "Fuel price",
            category: "politics",
          }),
          makeNews({ id: "sports", title: "Fuel price", category: "sports" }),
        ],
      },
    });
    const ctx = mockContext({ payload });

    const result = await call(
      newsRouter.search,
      { q: "fuel", category: "sports" },
      { context: ctx }
    );

    expect(result.docs.map((doc) => doc.id)).toEqual(["sports"]);
  });

  it("rejects a query shorter than two characters", async () => {
    const payload = createFakePayload();
    const ctx = mockContext({ payload });

    const error = await expectError(
      call(newsRouter.search, { q: "a" }, { context: ctx })
    );

    expect(error.code).toBe("BAD_REQUEST");
  });

  it("paginates newest first", async () => {
    const payload = createFakePayload({
      collections: {
        news: [
          makeNews({
            id: "oldest",
            title: "Fuel price",
            createdAt: "2026-01-01T00:00:00.000Z",
          }),
          makeNews({
            id: "newest",
            title: "Fuel price",
            createdAt: "2026-01-03T00:00:00.000Z",
          }),
          makeNews({
            id: "middle",
            title: "Fuel price",
            createdAt: "2026-01-02T00:00:00.000Z",
          }),
        ],
      },
    });
    const ctx = mockContext({ payload });

    const first = await call(
      newsRouter.search,
      { q: "fuel", limit: 1, page: 1 },
      { context: ctx }
    );
    const second = await call(
      newsRouter.search,
      { q: "fuel", limit: 1, page: 2 },
      { context: ctx }
    );

    expect(first.docs.map((doc) => doc.id)).toEqual(["newest"]);
    expect(second.docs.map((doc) => doc.id)).toEqual(["middle"]);
    expect(second.totalDocs).toBe(3);
  });
});
