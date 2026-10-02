import type { PayloadRequest } from "payload";
import { describe, expect, it } from "vitest";
import { announceGiveaway } from "../announceGiveaway";

function fakeReq() {
  const created: unknown[] = [];
  const req = {
    payload: {
      create: (args: unknown) => {
        created.push(args);
        return Promise.resolve({});
      },
      logger: { error: () => undefined },
    },
  } as unknown as PayloadRequest;
  return { req, created };
}

describe("announceGiveaway", () => {
  it("queues a push by default, keeping the placeholder for send time", async () => {
    const { req, created } = fakeReq();
    const result = await announceGiveaway(
      { id: "g1", description: "{{firstName}}, join 1500 winners" },
      req
    );
    expect(result.queued).toBe(true);
    expect(created).toHaveLength(1);
    expect(JSON.stringify(created[0])).toContain("{{firstName}}, join");
  });

  it("sends nothing when the announcement is switched off", async () => {
    const { req, created } = fakeReq();
    const result = await announceGiveaway(
      { id: "g1", description: "Hello", sendAnnouncement: false },
      req
    );
    expect(result).toEqual({
      queued: false,
      reason: "announcement switched off",
    });
    expect(created).toHaveLength(0);
  });

  it("sends nothing without a description", async () => {
    const { req, created } = fakeReq();
    expect(
      (await announceGiveaway({ id: "g1", description: " " }, req)).queued
    ).toBe(false);
    expect(created).toHaveLength(0);
  });
});
