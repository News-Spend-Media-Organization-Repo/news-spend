import type { BasePayload } from "payload";

import type { UnifiedOffer } from "./schemas";

export type OfferEventRow = {
  provider: UnifiedOffer["provider"];
  userId: string | null;
  country: string;
  offerCount: number;
};

/**
 * One row per provider per offers request, so fill can be measured. This is
 * analytics, not payment: a failure here must never stop the tab rendering.
 */
export async function writeOfferEvents(
  payload: BasePayload,
  rows: OfferEventRow[]
): Promise<void> {
  try {
    await Promise.all(
      rows.map((row) =>
        payload.create({
          collection: "survey-offer-events",
          data: {
            provider: row.provider,
            ...(row.userId ? { user: row.userId } : {}),
            country: row.country,
            offerCount: row.offerCount,
          },
        })
      )
    );
  } catch (error) {
    console.error("Could not record survey offer events:", error);
  }
}
