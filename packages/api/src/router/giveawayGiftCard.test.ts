import { describe, expect, it } from "bun:test";

import {
  createFakePayload,
  createTestClient,
  type Doc,
  expectError,
  mockContext,
} from "../test-utils";
import { giveawayRouter } from "./giveaway";

const owner = { id: "user-1", isAnonymous: false, username: "winner" };
const stranger = { id: "user-2", isAnonymous: false, username: "stranger" };

const NOW = new Date();
const PAST = new Date(NOW.getTime() - 86_400_000).toISOString();
const FUTURE = new Date(NOW.getTime() + 86_400_000 * 30).toISOString();

function giftCardGiveaway(overrides: Doc = {}): Doc {
  return {
    id: "gw-1",
    name: "Gift Card Giveaway",
    status: "active",
    startDate: PAST,
    endDate: FUTURE,
    ...overrides,
  };
}

function giftCardPrize(overrides: Doc = {}): Doc {
  return {
    id: "p1",
    name: "Amazon Gift Card",
    fulfilmentType: "gift_card",
    ...overrides,
  };
}

/**
 * A winner holding an issued gift card, seeded the way the fulfilment sweep
 * leaves it: the code, PIN and redemption details live on the winner row.
 */
function giftCardWinner(overrides: Doc = {}): Doc {
  return {
    id: "w1",
    giveaway: "gw-1",
    user: "user-1",
    tier: "tier3",
    prize: giftCardPrize(),
    prizeName: "Amazon Gift Card",
    claimStatus: "claimed",
    fulfilmentStatus: "fulfilled",
    giftCardCode: "CARD-1234-5678",
    giftCardPin: "9876",
    giftCardRedemptionUrl: "https://redeem.example/card",
    giftCardInstructions: "Redeem at amazon.com/redeem",
    selectedAt: PAST,
    ...overrides,
  };
}

function payloadWith(winner: Doc, user = owner) {
  const payload = createFakePayload({
    collections: {
      users: [owner],
      giveaways: [giftCardGiveaway()],
      "prize-catalogue": [giftCardPrize()],
      "giveaway-winners": [winner],
    },
  });
  return createTestClient(
    giveawayRouter,
    mockContext({ user: user as never, payload })
  );
}

describe("giveaway.prizeDetails gift card", () => {
  it("reveals a fulfilled gift card's code to its owner", async () => {
    const client = payloadWith(giftCardWinner());

    const result = await client.prizeDetails({ winnerId: "w1" });

    expect(result.giftCard).toEqual({
      code: "CARD-1234-5678",
      pin: "9876",
      redemptionUrl: "https://redeem.example/card",
      instructions: "Redeem at amazon.com/redeem",
    });
  });

  it("returns giftCard: null while the card is not yet fulfilled", async () => {
    const client = payloadWith(giftCardWinner({ fulfilmentStatus: "pending" }));

    const result = await client.prizeDetails({ winnerId: "w1" });

    expect(result.giftCard).toBeNull();
  });

  it("never lets another user read the winner's card", async () => {
    const client = payloadWith(giftCardWinner(), stranger);

    const error = await expectError(client.prizeDetails({ winnerId: "w1" }));

    expect(error.code).toBe("NOT_FOUND");
  });
});

describe("giveaway.history gift card", () => {
  it("keeps the code out of the history list", async () => {
    const client = payloadWith(
      giftCardWinner({ giftCardCode: "SECRET-CODE-9999" })
    );

    const result = await client.history({ page: 1, limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(JSON.stringify(result.items)).not.toContain("SECRET-CODE-9999");
    // The list shape has no giftCard key at all, not just a null one.
    expect((result.items[0] as Doc).giftCard).toBeUndefined();
  });
});
