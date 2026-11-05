import { describe, expect, it } from "bun:test";
import { isDefinedError } from "@orpc/client";
import { call, os } from "@orpc/server";
import z from "zod";

import type { Context } from "../context";
import { commonErrors } from "../errors";
import { mockContext } from "../test-utils";
import { createRateLimitMiddleware } from "./ratelimit";

// Build a real procedure with the rate-limit middleware attached, mirroring
// how routers compose procedures (see router/block.ts and index.ts basicProcedure).
// Each test gets a fresh procedure so the in-memory limiter starts at zero.
function rateLimitedProcedure() {
  return os
    .$context<Context>()
    .errors(commonErrors)
    .use(createRateLimitMiddleware({ maxRequests: 2, window: 60_000 }))
    .input(z.object({}))
    .handler(async () => ({ pong: true }));
}

const authedUser = {
  id: "user-1",
  isAnonymous: false,
  username: "tester",
};

describe("createRateLimitMiddleware", () => {
  it("allows requests within the limit", async () => {
    const procedure = rateLimitedProcedure();
    const ctx = mockContext({ user: authedUser as never });

    const first = await call(procedure, {}, { context: ctx });
    const second = await call(procedure, {}, { context: ctx });

    expect(first).toEqual({ pong: true });
    expect(second).toEqual({ pong: true });
  });

  it("rejects requests beyond the limit with TOO_MANY_REQUESTS", async () => {
    const procedure = rateLimitedProcedure();
    const ctx = mockContext({ user: authedUser as never });

    await call(procedure, {}, { context: ctx });
    await call(procedure, {}, { context: ctx });

    try {
      await call(procedure, {}, { context: ctx });
      expect.unreachable("expected the third call to be rate limited");
    } catch (error) {
      expect(isDefinedError(error)).toBe(true);
      expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS" });
    }
  });

  describe("keying an anonymous caller", () => {
    const withIp = (ip: string) =>
      mockContext({ headers: new Headers({ "x-forwarded-for": ip }) });

    it("gives each address its own allowance", async () => {
      const procedure = rateLimitedProcedure();
      const a = withIp("203.0.113.1");
      const b = withIp("203.0.113.2");

      await call(procedure, {}, { context: a });
      await call(procedure, {}, { context: a });

      // `a` is spent, `b` is untouched.
      await expect(call(procedure, {}, { context: b })).resolves.toEqual({
        pong: true,
      });
    });

    it("uses the first address when a proxy chain is listed", async () => {
      const procedure = rateLimitedProcedure();
      const first = withIp("203.0.113.9, 10.0.0.1");
      const sameClient = withIp("203.0.113.9, 10.0.0.2");

      await call(procedure, {}, { context: first });
      await call(procedure, {}, { context: first });

      await expect(
        call(procedure, {}, { context: sameClient })
      ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    });

    it("still limits a caller that has no request at all, instead of throwing", async () => {
      // `createContext` can produce no request; the key must not depend on one.
      const procedure = rateLimitedProcedure();
      const ctx = {
        ...mockContext(),
        request: undefined,
      } as unknown as Context;

      await call(procedure, {}, { context: ctx });
      await call(procedure, {}, { context: ctx });

      await expect(call(procedure, {}, { context: ctx })).rejects.toMatchObject(
        {
          code: "TOO_MANY_REQUESTS",
        }
      );
    });
  });

  describe("the `by` option", () => {
    const ipProcedure = (by?: "caller" | "ip") =>
      os
        .$context<Context>()
        .errors(commonErrors)
        .use(createRateLimitMiddleware({ maxRequests: 2, by }))
        .input(z.object({}))
        .handler(async () => ({ pong: true }));
    const from = (ip: string, user?: typeof authedUser) =>
      mockContext({
        headers: new Headers({ "x-forwarded-for": ip }),
        ...(user ? { user: user as never } : {}),
      });

    it('keys by user when `by` is omitted or "caller" (unchanged)', async () => {
      for (const by of [undefined, "caller" as const]) {
        const procedure = ipProcedure(by);
        const a = from("203.0.113.1", authedUser);
        const b = from("203.0.113.1", { ...authedUser, id: "user-2" });
        await call(procedure, {}, { context: a });
        await call(procedure, {}, { context: a });
        await expect(call(procedure, {}, { context: a })).rejects.toMatchObject(
          { code: "TOO_MANY_REQUESTS" }
        );
        // Same IP, different user: its own bucket.
        await expect(call(procedure, {}, { context: b })).resolves.toEqual({
          pong: true,
        });
      }
    });

    it('"ip" ignores the user id: two users behind one address share a bucket', async () => {
      const procedure = ipProcedure("ip");
      const a = from("203.0.113.5", authedUser);
      const b = from("203.0.113.5", { ...authedUser, id: "user-2" });
      await call(procedure, {}, { context: a });
      await call(procedure, {}, { context: b });
      await expect(call(procedure, {}, { context: a })).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });
    });

    it('"ip" gives other addresses their own bucket and uses the first forwarded address', async () => {
      const procedure = ipProcedure("ip");
      await call(procedure, {}, { context: from("203.0.113.7, 10.0.0.1") });
      await call(procedure, {}, { context: from("203.0.113.7, 10.0.0.2") });
      await expect(
        call(procedure, {}, { context: from("203.0.113.7") })
      ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
      await expect(
        call(procedure, {}, { context: from("203.0.113.8") })
      ).resolves.toEqual({ pong: true });
    });

    it('"ip" falls back to cf-connecting-ip', async () => {
      const procedure = ipProcedure("ip");
      const cf = (ip: string) =>
        mockContext({ headers: new Headers({ "cf-connecting-ip": ip }) });
      await call(procedure, {}, { context: cf("198.51.100.1") });
      await call(procedure, {}, { context: cf("198.51.100.1") });
      await expect(
        call(procedure, {}, { context: cf("198.51.100.1") })
      ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    });
  });
});
