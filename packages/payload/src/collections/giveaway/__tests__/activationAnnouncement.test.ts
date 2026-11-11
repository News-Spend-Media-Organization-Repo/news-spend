import type { PayloadRequest } from "payload";
import { describe, expect, it } from "vitest";
import { Giveaways } from "../Giveaways";

function activationHook() {
  const hooks = Giveaways.hooks?.afterChange;
  const hook = Array.isArray(hooks) ? hooks[0] : hooks;
  if (!hook) {
    throw new Error("giveaways has no afterChange hook");
  }
  return hook;
}

function fakeReq(createFails = false) {
  const created: unknown[] = [];
  const updated: { data?: { hasBeenAnnounced?: boolean } }[] = [];
  const req = {
    payload: {
      create: (args: unknown) => {
        created.push(args);
        return createFails
          ? Promise.reject(new Error("queue unavailable"))
          : Promise.resolve({});
      },
      update: (args: { data?: { hasBeenAnnounced?: boolean } }) => {
        updated.push(args);
        return Promise.resolve({});
      },
      logger: { error: () => undefined },
    },
  } as unknown as PayloadRequest;
  return { req, created, updated };
}

async function change(
  req: PayloadRequest,
  doc: {
    id: string;
    status: string;
    description?: string;
    hasBeenAnnounced?: boolean;
  },
  previousDoc: { status: string }
) {
  await activationHook()({
    collection: Giveaways,
    context: {},
    data: doc,
    doc,
    operation: "update",
    previousDoc,
    req,
  } as never);
}

describe("giveaway activation announcement", () => {
  it("announces a draft going active, then records it", async () => {
    const { req, created, updated } = fakeReq();
    await change(
      req,
      { id: "g1", status: "active", description: "Join now" },
      { status: "draft" }
    );
    expect(created).toHaveLength(1);
    expect(updated).toEqual([
      {
        collection: "giveaways",
        id: "g1",
        data: { hasBeenAnnounced: true },
        req,
      },
    ]);
  });

  it("stays quiet when a live giveaway is drafted and activated again", async () => {
    const { req, created, updated } = fakeReq();
    await change(
      req,
      { id: "g1", status: "active", hasBeenAnnounced: true },
      { status: "draft" }
    );
    expect(created).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });

  it("stays quiet on a plain save of a live giveaway", async () => {
    const { req, created, updated } = fakeReq();
    await change(
      req,
      { id: "g1", status: "active", hasBeenAnnounced: true },
      { status: "active" }
    );
    expect(created).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });

  it("keeps the flag off when queueing fails, so a later save retries", async () => {
    const { req, created, updated } = fakeReq(true);
    await change(
      req,
      { id: "g1", status: "active", description: "Join now" },
      { status: "draft" }
    );
    expect(created).toHaveLength(1);
    expect(updated).toHaveLength(0);
  });
});
