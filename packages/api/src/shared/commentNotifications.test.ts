import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import {
  notifyCommentReply,
  scheduleCommentLikeNotification,
} from "./commentNotifications";

type MockPayload = {
  create: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  findByID: ReturnType<typeof vi.fn>;
  jobs: {
    queue: ReturnType<typeof vi.fn>;
  };
  logger: {
    error: ReturnType<typeof vi.fn>;
  };
};

const createContext = (payloadOverrides: Partial<MockPayload> = {}) =>
  ({
    payload: {
      create: vi.fn(),
      find: vi.fn(),
      findByID: vi.fn(),
      jobs: {
        queue: vi.fn(),
      },
      logger: {
        error: vi.fn(),
      },
      ...payloadOverrides,
    },
  }) as unknown as Context;

describe("notifyCommentReply", () => {
  it("does not create a notification for self-replies", async () => {
    const ctx = createContext();

    await notifyCommentReply(ctx, {
      recipientId: "user-1",
      actorId: "user-1",
      actorUsername: "alice",
      commentId: "comment-1",
      newsId: "news-1",
      text: "hello",
    });

    expect(ctx.payload.create).not.toHaveBeenCalled();
    expect(ctx.payload.findByID).not.toHaveBeenCalled();
  });

  it("respects comment notification preferences", async () => {
    const ctx = createContext({
      findByID: vi.fn().mockResolvedValue({
        notificationPreferences: {
          types: {
            COMMENT: false,
          },
        },
      }),
    });

    await notifyCommentReply(ctx, {
      recipientId: "user-2",
      actorId: "user-1",
      actorUsername: "alice",
      commentId: "comment-1",
      newsId: "news-1",
      text: "hello",
    });

    expect(ctx.payload.create).not.toHaveBeenCalled();
  });
});

describe("scheduleCommentLikeNotification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T09:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not enqueue another job when one is already pending", async () => {
    const ctx = createContext({
      find: vi.fn().mockResolvedValue({ docs: [{ id: "job-1" }] }),
    });

    await scheduleCommentLikeNotification(ctx, {
      commentId: "comment-1",
      authorId: "author-1",
      actorId: "liker-1",
    });

    expect(ctx.payload.jobs.queue).not.toHaveBeenCalled();
  });

  it("enqueues one debounced job when no pending job exists and preferences allow", async () => {
    const ctx = createContext({
      find: vi.fn().mockResolvedValue({ docs: [] }),
      findByID: vi.fn().mockResolvedValue({
        notificationPreferences: {
          types: {
            COMMENT: true,
          },
        },
      }),
    });

    await scheduleCommentLikeNotification(ctx, {
      commentId: "comment-1",
      authorId: "author-1",
      actorId: "liker-1",
    });

    expect(ctx.payload.jobs.queue).toHaveBeenCalledTimes(1);
    expect(ctx.payload.jobs.queue).toHaveBeenCalledWith({
      task: "sendCommentLikeNotification",
      input: { commentId: "comment-1" },
      waitUntil: new Date("2026-07-18T09:30:00.000Z"),
    });
  });
});
