import { describe, expect, it } from "bun:test";

import { createFakePayload } from "../../../test-utils";
import { writeOfferEvents } from "./events";

describe("writeOfferEvents", () => {
  it("records one row per provider", async () => {
    const payload = createFakePayload({
      collections: { "survey-offer-events": [] },
    });

    await writeOfferEvents(payload as never, [
      { provider: "cpx", userId: "user-1", country: "NG", offerCount: 3 },
      { provider: "rapido", userId: "user-1", country: "NG", offerCount: 0 },
    ]);

    expect(payload.docs("survey-offer-events")).toHaveLength(2);
  });

  it("swallows a write failure so the tab still renders", async () => {
    const payload = createFakePayload();
    payload.create = (() => Promise.reject(new Error("down"))) as never;

    await expect(
      writeOfferEvents(payload as never, [
        { provider: "cpx", userId: null, country: "NG", offerCount: 0 },
      ])
    ).resolves.toBeUndefined();
  });
});
