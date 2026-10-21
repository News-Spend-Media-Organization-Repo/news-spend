import { act, renderHook } from "@testing-library/react-native";

import { usePartnerClick } from "../usePartnerClick";

const mockMutateAsync = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockNavigate = jest.fn();
const mockTrackEvent = jest.fn();

let mockUser: { isAnonymous?: boolean } | null = { isAnonymous: false };

jest.mock("@tanstack/react-query", () => ({
  useMutation: () => ({
    mutateAsync: (...args: unknown[]) => mockMutateAsync(...args),
  }),
  useQueryClient: () => ({
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
  }),
}));

jest.mock("#/lib/orpc", () => ({
  orpc: {
    partnerConversions: {
      trackClick: { mutationOptions: () => ({}) },
    },
    partnerContent: {
      filtered: { key: () => ["partnerContent", "filtered"] },
    },
    activity: {
      pendingOffers: { key: () => ["activity", "pendingOffers"] },
    },
  },
}));

jest.mock("../usePartnerEvents", () => ({
  usePartnerEvents: () => ({
    trackImpression: jest.fn(),
    trackClick: (...args: unknown[]) => mockTrackEvent(...args),
  }),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
}));

jest.mock("#/navigation/navigationUtils", () => ({
  navigate: (...args: unknown[]) => mockNavigate(...args),
}));

jest.mock("#/state/auth", () => ({
  authState: {
    get user() {
      return mockUser;
    },
  },
}));

jest.mock("#/utils/openStoreLink", () => ({
  openStoreLink: jest.fn(() => Promise.resolve(true)),
}));

const item = {
  id: "pc-1",
  title: "An offer",
  links: { website: "https://example.com/offer" },
} as never;

describe("usePartnerClick", () => {
  let now = new Date("2026-10-21T12:00:00Z").getTime();
  beforeEach(() => {
    jest.clearAllMocks();
    // The double-tap guard is module state keyed by item id; a minute between
    // tests keeps one test's taps out of the next one's window.
    now += 60_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    mockUser = { isAnonymous: false };
    mockMutateAsync.mockResolvedValue({});
  });

  it("sends the surface the item was requested with", async () => {
    const { result } = await renderHook(() => usePartnerClick());

    await act(async () => {
      await result.current.handleClick(item, "points-mall-apps");
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      partnerContentId: "pc-1",
      clickId: "clk_aaaaaaaabbbbcccc",
      surface: "points-mall-apps",
    });
  });

  it("refreshes the offer lists once the tap has settled", async () => {
    const { result } = await renderHook(() => usePartnerClick());

    await act(async () => {
      await result.current.handleClick(item, "lucky-app-wall");
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["partnerContent", "filtered"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["activity", "pendingOffers"],
    });
  });

  it("refreshes the lists even when tracking fails", async () => {
    mockMutateAsync.mockRejectedValue(new Error("boom"));
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = await renderHook(() => usePartnerClick());

    await act(async () => {
      await result.current.handleClick(item, "points-mall-books");
    });

    expect(mockInvalidateQueries).toHaveBeenCalledTimes(2);
  });

  it("does not track a guest's tap", async () => {
    mockUser = { isAnonymous: true };
    const { result } = await renderHook(() => usePartnerClick());

    await act(async () => {
      await result.current.handleClick(item, "points-mall-apps");
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  describe("click events", () => {
    it("records the event and the mutation for a signed-in tap", async () => {
      const { result } = await renderHook(() => usePartnerClick());

      await act(async () => {
        await result.current.handleClick(item, "points-mall-apps");
      });

      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockTrackEvent).toHaveBeenCalledWith("pc-1", "points-mall-apps");
    });

    it("records only the event for a guest's tap", async () => {
      mockUser = { isAnonymous: true };
      const { result } = await renderHook(() => usePartnerClick());

      await act(async () => {
        await result.current.handleClick(item, "points-mall-apps");
      });

      expect(mockTrackEvent).toHaveBeenCalledWith("pc-1", "points-mall-apps");
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it("records nothing for an item with no link", async () => {
      const noLink = { id: "pc-2", title: "No link", links: {} } as never;
      const { result } = await renderHook(() => usePartnerClick());

      await act(async () => {
        await result.current.handleClick(noLink, "points-mall-apps");
      });

      expect(mockTrackEvent).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("records the event even when the mutation rejects", async () => {
      mockMutateAsync.mockRejectedValue(new Error("boom"));
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const { result } = await renderHook(() => usePartnerClick());

      await act(async () => {
        await result.current.handleClick(item, "points-mall-apps");
      });

      expect(mockTrackEvent).toHaveBeenCalledWith("pc-1", "points-mall-apps");
    });

    it("records the event before navigating", async () => {
      const { result } = await renderHook(() => usePartnerClick());

      await act(async () => {
        await result.current.handleClick(item, "points-mall-apps");
      });

      const trackOrder = mockTrackEvent.mock.invocationCallOrder[0];
      const navigateOrder = mockNavigate.mock.invocationCallOrder[0];
      expect(trackOrder).toBeDefined();
      expect(navigateOrder).toBeDefined();
      expect(trackOrder as number).toBeLessThan(navigateOrder as number);
    });
  });

  describe("double taps", () => {
    const tap = async (
      result: { current: ReturnType<typeof usePartnerClick> },
      target: never = item
    ) => {
      await act(async () => {
        await result.current.handleClick(target, "points-mall-apps");
      });
    };

    it("records one event for a guest's double tap within a second", async () => {
      mockUser = { isAnonymous: true };
      const { result } = await renderHook(() => usePartnerClick());

      await tap(result);
      now += 400;
      await tap(result);

      expect(mockTrackEvent).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledTimes(2);
    });

    it("records a second event for a tap after a second", async () => {
      mockUser = { isAnonymous: true };
      const { result } = await renderHook(() => usePartnerClick());

      await tap(result);
      now += 1001;
      await tap(result);

      expect(mockTrackEvent).toHaveBeenCalledTimes(2);
    });

    it("records each of two different items", async () => {
      mockUser = { isAnonymous: true };
      const other = {
        id: "pc-9",
        title: "Another",
        links: { website: "https://example.com/other" },
      } as never;
      const { result } = await renderHook(() => usePartnerClick());

      await tap(result);
      await tap(result, other);

      expect(mockTrackEvent).toHaveBeenCalledTimes(2);
    });

    it("does not repeat the CPA mutation or the event for a signed-in double tap, but still opens the link", async () => {
      const { result } = await renderHook(() => usePartnerClick());

      await tap(result);
      now += 300;
      await tap(result);

      expect(mockTrackEvent).toHaveBeenCalledTimes(1);
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledTimes(2);
    });

    it("leaves a signed-in tap after the window unchanged", async () => {
      const { result } = await renderHook(() => usePartnerClick());

      await tap(result);
      now += 1500;
      await tap(result);

      expect(mockTrackEvent).toHaveBeenCalledTimes(2);
      expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    });
  });
});
