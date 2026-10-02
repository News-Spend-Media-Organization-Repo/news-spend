import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";

import { createFakePayload, mockContext } from "../test-utils";
import { newsRouter } from "./news";

/** Redis SET with NX: first writer wins, everyone else gets null. */
const seen = new Set<string>();
const fakeRedis = {
  set: async (key: string, ..._rest: unknown[]) => {
    if (seen.has(key)) {
      return null;
    }
    seen.add(key);
    return "OK";
  },
};

mock.module("../lib/redis", () => ({
  getRedis: () => fakeRedis,
}));

function newsDoc() {
  return {
    id: "news-1",
    slug: "test-article",
    title: "Test Article",
    type: "article",
    _status: "published",
    views: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function setup() {
  seen.clear();
  const payload = createFakePayload({ collections: { news: [newsDoc()] } });
  Object.assign(payload.db, {
    drizzle: { execute: async () => ({ rows: [{ views: 11 }] }) },
  });
  // Signed out, no IP headers: without a device id every call shares one key.
  return mockContext({ payload, user: null });
}

describe("newsRouter.recordView dedupe", () => {
  it("counts two devices behind one IP separately", async () => {
    const ctx = setup();

    const first = await call(
      newsRouter.recordView,
      { newsId: "news-1", deviceId: "device-a" },
      { context: ctx }
    );
    const second = await call(
      newsRouter.recordView,
      { newsId: "news-1", deviceId: "device-b" },
      { context: ctx }
    );

    expect(first.incremented).toBe(true);
    expect(second.incremented).toBe(true);
  });

  it("counts one device once", async () => {
    const ctx = setup();

    await call(
      newsRouter.recordView,
      { newsId: "news-1", deviceId: "device-a" },
      { context: ctx }
    );
    const repeat = await call(
      newsRouter.recordView,
      { newsId: "news-1", deviceId: "device-a" },
      { context: ctx }
    );

    expect(repeat.incremented).toBe(false);
  });

  it("keeps the user key for signed-in readers with a device id", async () => {
    const payload = createFakePayload({ collections: { news: [newsDoc()] } });
    Object.assign(payload.db, {
      drizzle: { execute: async () => ({ rows: [{ views: 11 }] }) },
    });
    seen.clear();
    const ctx = mockContext({
      payload,
      user: { id: "user-1", isAnonymous: false },
    });

    const result = await call(
      newsRouter.recordView,
      { newsId: "news-1", deviceId: "device-a" },
      { context: ctx }
    );

    expect(result.incremented).toBe(true);
    expect([...seen][0]).toContain(":user:user-1");
  });
});
