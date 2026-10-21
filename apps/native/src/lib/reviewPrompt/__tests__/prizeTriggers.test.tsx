import { renderHook } from "@testing-library/react-native";

const mockMaybeRequestReview = jest.fn();

jest.mock("../index", () => ({
  maybeRequestReview: (...args: unknown[]) => mockMaybeRequestReview(...args),
}));

import {
  reviewAfterClaim,
  shouldPromptAfterClaim,
  usePrizeDeliveredReview,
} from "../prizeTriggers";

const claimed = {
  awaitingVerification: false,
  underReview: false,
  fulfilmentStatus: "pending",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("shouldPromptAfterClaim", () => {
  it.each([
    ["pending", claimed],
    ["fulfilled", { ...claimed, fulfilmentStatus: "fulfilled" }],
  ])("is true for a normal %s claim", (_name, result) => {
    expect(shouldPromptAfterClaim(result)).toBe(true);
  });

  it("is false when the winner still has a verification step", () => {
    expect(
      shouldPromptAfterClaim({
        ...claimed,
        awaitingVerification: true,
        fulfilmentStatus: "awaiting_verification",
      })
    ).toBe(false);
  });

  it("is false when the prize is under review", () => {
    expect(shouldPromptAfterClaim({ ...claimed, underReview: true })).toBe(
      false
    );
  });

  it("is false when the prize is on hold", () => {
    expect(
      shouldPromptAfterClaim({ ...claimed, fulfilmentStatus: "on_hold" })
    ).toBe(false);
  });
});

describe("reviewAfterClaim", () => {
  it("asks for a review once after a normal claim", () => {
    reviewAfterClaim(claimed);

    expect(mockMaybeRequestReview).toHaveBeenCalledTimes(1);
    expect(mockMaybeRequestReview).toHaveBeenCalledWith("PRIZE_CLAIMED");
  });

  it.each([
    ["awaiting verification", { ...claimed, awaitingVerification: true }],
    ["under review", { ...claimed, underReview: true }],
    ["on hold", { ...claimed, fulfilmentStatus: "on_hold" }],
  ])("never asks when the claim is %s", (_name, result) => {
    reviewAfterClaim(result);

    expect(mockMaybeRequestReview).not.toHaveBeenCalled();
  });
});

describe("usePrizeDeliveredReview", () => {
  const prize = (overrides: Record<string, string> = {}) => ({
    id: "winner-1",
    claimStatus: "claimed",
    fulfilmentStatus: "fulfilled",
    ...overrides,
  });

  it("asks once on mount for a claimed and fulfilled prize", async () => {
    await renderHook(() => usePrizeDeliveredReview(prize()));

    expect(mockMaybeRequestReview).toHaveBeenCalledTimes(1);
    expect(mockMaybeRequestReview).toHaveBeenCalledWith("PRIZE_DELIVERED");
  });

  it.each([
    ["pending", { fulfilmentStatus: "pending" }],
    ["on hold", { fulfilmentStatus: "on_hold" }],
    ["cancelled", { fulfilmentStatus: "cancelled" }],
    ["awaiting verification", { fulfilmentStatus: "awaiting_verification" }],
    ["in progress", { fulfilmentStatus: "in_progress" }],
    ["unclaimed", { claimStatus: "unclaimed" }],
  ])("never asks for a %s prize", async (_name, overrides) => {
    await renderHook(() => usePrizeDeliveredReview(prize(overrides)));

    expect(mockMaybeRequestReview).not.toHaveBeenCalled();
  });

  it("does nothing while the prize is still loading", async () => {
    await renderHook(() => usePrizeDeliveredReview(undefined));

    expect(mockMaybeRequestReview).not.toHaveBeenCalled();
  });

  it("does not ask again when the screen re-renders", async () => {
    const { rerender } = await renderHook(
      ({ p }: { p: ReturnType<typeof prize> }) => usePrizeDeliveredReview(p),
      { initialProps: { p: prize() } }
    );

    await rerender({ p: prize() });
    await rerender({ p: prize() });

    expect(mockMaybeRequestReview).toHaveBeenCalledTimes(1);
  });

  it("asks when a pending prize becomes fulfilled while open", async () => {
    const { rerender } = await renderHook(
      ({ p }: { p: ReturnType<typeof prize> }) => usePrizeDeliveredReview(p),
      { initialProps: { p: prize({ fulfilmentStatus: "pending" }) } }
    );
    expect(mockMaybeRequestReview).not.toHaveBeenCalled();

    await rerender({ p: prize() });

    expect(mockMaybeRequestReview).toHaveBeenCalledTimes(1);
  });
});
