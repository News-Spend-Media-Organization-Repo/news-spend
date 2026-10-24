import { isOfferPlacement } from "./earnPlacements";

type ChecklistDoc = {
  placements?: readonly string[] | null;
  points?: number | null;
  adCopy?: string | null;
};

export type ChecklistItem = {
  key:
    | "points-without-offer-placement"
    | "offer-placement-without-points"
    | "missing-ad-copy";
  ok: boolean;
  message: string;
};

/** The save-time warnings Payload cannot show, as pass/fail marks for one item. */
export function partnerContentChecklist(doc: ChecklistDoc): ChecklistItem[] {
  const placements = doc.placements ?? [];
  const points = doc.points ?? 0;
  const hasOffer = placements.some(isOfferPlacement);
  const hasPoints = points > 0;
  const hasAdCopy = (doc.adCopy ?? "").trim() !== "";

  return [
    {
      key: "points-without-offer-placement",
      ok: !hasPoints || hasOffer,
      message:
        !hasPoints || hasOffer
          ? "Points are only set alongside an offer placement."
          : "Points are set but no offer placement is selected; users will not be paid.",
    },
    {
      key: "offer-placement-without-points",
      ok: !hasOffer || hasPoints,
      message:
        !hasOffer || hasPoints
          ? "Every selected offer placement has points to pay."
          : "An offer placement is selected but points are 0; the offer would show no reward.",
    },
    {
      key: "missing-ad-copy",
      ok: hasAdCopy,
      message: hasAdCopy
        ? "Ad copy is in place."
        : "This item has no ad copy; ad surfaces will have nothing to show.",
    },
  ];
}
