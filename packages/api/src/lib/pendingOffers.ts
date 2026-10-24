export type PendingOffer = {
  contentId: string;
  title: string;
  partnerName: string | null;
  state: "pending" | "not_confirmed";
  expectedWithinDays: number;
  /** What the offer pays once the partner confirms it. */
  points: number;
  clickedAt: string;
};

export type PendingState = "pending" | "not_confirmed" | "hidden";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CONFIRMATION_DAYS = 7;
/** How long an unconfirmed offer stays visible after it stops being pending. */
const NOT_CONFIRMED_VISIBLE_DAYS = 14;

/** A missing or non-positive window falls back to the default. */
export function effectiveConfirmationDays(
  confirmationDays: number | null | undefined
): number {
  return typeof confirmationDays === "number" && confirmationDays > 0
    ? confirmationDays
    : DEFAULT_CONFIRMATION_DAYS;
}

/**
 * Where a partner conversion sits for the user: waiting on the partner,
 * past the partner's window without confirmation, or no longer worth showing.
 */
export function pendingStateFor({
  status,
  clickedAt,
  convertedAt,
  confirmationDays,
  now,
}: {
  status: string;
  clickedAt: string;
  convertedAt?: string | null;
  confirmationDays: number | null | undefined;
  now: Date;
}): PendingState {
  if (status === "awarded" || status === "converted") {
    return "hidden";
  }

  const visibleUntil = (from: string) =>
    new Date(from).getTime() + NOT_CONFIRMED_VISIBLE_DAYS * DAY_MS;

  if (status === "failed") {
    return now.getTime() < visibleUntil(convertedAt ?? clickedAt)
      ? "not_confirmed"
      : "hidden";
  }

  if (status !== "clicked") {
    return "hidden";
  }

  const deadline =
    new Date(clickedAt).getTime() +
    effectiveConfirmationDays(confirmationDays) * DAY_MS;
  if (now.getTime() < deadline) {
    return "pending";
  }
  return now.getTime() < visibleUntil(clickedAt) ? "not_confirmed" : "hidden";
}
