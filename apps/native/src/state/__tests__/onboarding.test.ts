import { renderHook } from "@testing-library/react-native";
import {
  markOnboardingSeen,
  onboardingState,
  useNeedsOnboarding,
} from "#/state/onboarding";
import { storage } from "#/utils/storage";

jest.mock("#/utils/storage", () => ({
  storage: {
    getBoolean: jest.fn(() => false),
    set: jest.fn(),
  },
}));

beforeEach(() => {
  onboardingState.seen = false;
  jest.clearAllMocks();
});

describe("useNeedsOnboarding", () => {
  it("opens for a signed-out user who has never seen onboarding", async () => {
    const { result } = await renderHook(() => useNeedsOnboarding(true));

    expect(result.current).toBe(true);
  });

  it("stays shut for signed-in users", async () => {
    const { result } = await renderHook(() => useNeedsOnboarding(false));

    expect(result.current).toBe(false);
  });

  it("stays shut after onboarding is finished, even after signing out again", async () => {
    const { result, rerender } = await renderHook(
      ({ isSignedOut }: { isSignedOut: boolean }) =>
        useNeedsOnboarding(isSignedOut),
      { initialProps: { isSignedOut: true } }
    );

    expect(result.current).toBe(true);

    markOnboardingSeen();
    await rerender({ isSignedOut: false });
    expect(result.current).toBe(false);

    // The startup-snapshot version of this gate re-armed the carousel here,
    // dropping a user who had just signed out back into onboarding.
    await rerender({ isSignedOut: true });
    expect(result.current).toBe(false);
  });

  it("persists the flag when onboarding is finished", () => {
    markOnboardingSeen();

    expect(storage.set).toHaveBeenCalledWith("HAS_SEEN_ONBOARDING", true);
  });
});
