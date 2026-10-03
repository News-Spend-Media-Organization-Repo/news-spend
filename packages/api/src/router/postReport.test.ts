import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import { createFakePayload, expectError, mockContext } from "../test-utils";
import { postReportRouter } from "./postReport";

const authedUser = { id: "user-1", isAnonymous: false, username: "tester" };
const guestUser = { id: "guest-1", isAnonymous: true, username: "guest" };

const validInput = {
  relationTo: "news" as const,
  reason: "spam" as const,
  additionalDetails: "This is spam content",
  reportedItem: "news-123",
};

describe("postReportRouter.create", () => {
  it("rejects an unauthenticated caller", async () => {
    const error = await expectError(
      call(postReportRouter.create, validInput, {
        context: mockContext(),
      })
    );

    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a guest caller", async () => {
    const error = await expectError(
      call(postReportRouter.create, validInput, {
        context: mockContext({ user: guestUser as never }),
      })
    );

    expect(error).toMatchObject({
      code: "FORBIDDEN",
      message: "Guest users cannot perform this action",
    });
  });

  it("creates a content report and returns the document", async () => {
    const payload = createFakePayload({
      collections: { contentReports: [] },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(postReportRouter.create, validInput, {
      context: ctx,
    });

    expect(payload.docs("contentReports")).toHaveLength(1);
    expect(payload.docs("contentReports")[0]).toMatchObject({
      reportedBy: "user-1",
      reportedItem: { relationTo: "news", value: "news-123" },
      reason: "spam",
      additionalDetails: "This is spam content",
    });
    expect(result).toMatchObject({
      reportedBy: "user-1",
      reportedItem: { relationTo: "news", value: "news-123" },
    });
  });

  it("rejects an invalid reason enum with BAD_REQUEST", async () => {
    const payload = createFakePayload({
      collections: { contentReports: [] },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(
        postReportRouter.create,
        { ...validInput, reason: "not-a-reason" } as never,
        { context: ctx }
      )
    );

    expect(error).toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });
    expect(payload.calls).toHaveLength(0);
  });

  it("rate limits a caller past the 5-request allowance", async () => {
    const payload = createFakePayload({
      collections: { contentReports: [] },
    });
    // Unique user id keeps this test independent of other rate-limit tests.
    const user = { id: `rl-${Date.now()}`, isAnonymous: false, username: "rl" };
    const ctx = mockContext({ user: user as never, payload });

    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        call(
          postReportRouter.create,
          { ...validInput, reportedItem: `news-${i}` },
          { context: ctx }
        ).then(
          () => "ok",
          (error: { code: string }) => error.code
        )
      )
    );

    expect(attempts.filter((a) => a === "ok")).toHaveLength(5);
    expect(attempts.filter((a) => a === "TOO_MANY_REQUESTS")).toHaveLength(1);
  });
});

describe("postReportRouter.createGame", () => {
  const gameInput = {
    gameId: "prism-match-3d",
    reason: "inappropriate" as const,
    additionalDetails: "Shows a gambling ad",
  };

  it("rejects an unauthenticated caller and a guest", async () => {
    const anon = await expectError(
      call(postReportRouter.createGame, gameInput, { context: mockContext() })
    );
    expect(anon.code).toBe("UNAUTHORIZED");

    const guest = await expectError(
      call(postReportRouter.createGame, gameInput, {
        context: mockContext({ user: guestUser as never }),
      })
    );
    expect(guest.code).toBe("FORBIDDEN");
  });

  it("records a report naming the game, not a document", async () => {
    const payload = createFakePayload({ collections: { contentReports: [] } });
    const ctx = mockContext({ user: authedUser as never, payload });

    await call(postReportRouter.createGame, gameInput, { context: ctx });

    expect(payload.docs("contentReports")).toHaveLength(1);
    const report = payload.docs("contentReports")[0] as Record<string, unknown>;
    expect(report).toMatchObject({
      reportedBy: "user-1",
      reportedGame: "prism-match-3d",
      reason: "inappropriate",
      additionalDetails: "Shows a gambling ad",
    });
    expect(report.reportedItem).toBeUndefined();
  });

  it("refuses a game id that is not a slug", async () => {
    const payload = createFakePayload({ collections: { contentReports: [] } });
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(
        postReportRouter.createGame,
        { ...gameInput, gameId: "../../etc/passwd" },
        { context: ctx }
      )
    );

    expect(error.code).toBe("BAD_REQUEST");
    expect(payload.docs("contentReports")).toHaveLength(0);
  });
});
