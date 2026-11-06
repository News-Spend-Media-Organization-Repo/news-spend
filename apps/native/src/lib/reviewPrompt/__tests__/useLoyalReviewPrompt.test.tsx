import { renderHook } from "@testing-library/react-native";

const mockStore = new Map<string, number>();
const mockMaybeRequestReview = jest.fn();

let mockFocus: (() => void) | undefined;
let mockUser: { isAnonymous?: boolean } | null = { isAnonymous: false };

jest.mock("@react-navigation/native", () => ({
  useIsFocused: jest.fn(() => true),
  useFocusEffect: (effect: () => void) => {
    mockFocus = effect;
  },
}));

jest.mock("valtio", () => ({
  useSnapshot: () => ({ user: mockUser }),
}));
jest.mock("#/state/auth", () => ({ authState: {} }));

jest.mock("#/utils/storage", () => ({
  storage: {
    getNumber: (key: string) => mockStore.get(key),
    set: (key: string, value: number) => {
      mockStore.set(key, value);
    },
  },
}));

jest.mock("../index", () => ({
  maybeRequestReview: (...args: unknown[]) => mockMaybeRequestReview(...args),
}));

import {
  resetLoyalReviewPromptSession,
  useLoyalReviewPrompt,
} from "../useLoyalReviewPrompt";

const HOUR = 60 * 60 * 1000;
const CHECKED_KEY = "review.loyalCheckedAt";

const mount = async () => {
  await renderHook(() => useLoyalReviewPrompt());
  return {
    focus: () => mockFocus?.(),
  };
};

beforeEach(() => {
  resetLoyalReviewPromptSession();
  jest.clearAllMocks();
  mockStore.clear();
  mockFocus = undefined;
  mockUser = { isAnonymous: false };
});

describe("useLoyalReviewPrompt", () => {
  it("does not fire on the first focus of the session", async () => {
    const { focus } = await mount();

    focus();

    expect(mockMaybeRequestReview).not.toHaveBeenCalled();
  });

  it("fires LOYAL_USER on a later focus", async () => {
    const { focus } = await mount();

    focus();
    focus();

    expect(mockMaybeRequestReview).toHaveBeenCalledTimes(1);
    expect(mockMaybeRequestReview).toHaveBeenCalledWith("LOYAL_USER");
  });

  it("fires at most once per session however often Home regains focus", async () => {
    const { focus } = await mount();

    for (let i = 0; i < 6; i++) {
      focus();
    }

    expect(mockMaybeRequestReview).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the last check was under 24 hours ago", async () => {
    mockStore.set(CHECKED_KEY, Date.now() - 2 * HOUR);
    const { focus } = await mount();

    focus();
    focus();

    expect(mockMaybeRequestReview).not.toHaveBeenCalled();
  });

  it("checks again once 24 hours have passed", async () => {
    mockStore.set(CHECKED_KEY, Date.now() - 25 * HOUR);
    const { focus } = await mount();

    focus();
    focus();

    expect(mockMaybeRequestReview).toHaveBeenCalledTimes(1);
  });

  it("records the check time before asking", async () => {
    let storedWhenAsked: number | undefined;
    mockMaybeRequestReview.mockImplementation(() => {
      storedWhenAsked = mockStore.get(CHECKED_KEY);
    });
    const { focus } = await mount();

    focus();
    focus();

    expect(storedWhenAsked).toBeGreaterThan(0);
  });

  it.each([
    ["signed out", null],
    ["a guest", { isAnonymous: true }],
  ])("never fires for %s, and does not use up the daily check", async (_name, user) => {
    mockUser = user;
    const { focus } = await mount();

    focus();
    focus();

    expect(mockMaybeRequestReview).not.toHaveBeenCalled();
    expect(mockStore.has(CHECKED_KEY)).toBe(false);
  });
});
