import { act, renderHook } from "@testing-library/react-native";

import { usePartnerClick } from "../usePartnerClick";

const mockMutateAsync = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockNavigate = jest.fn();

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
  beforeEach(() => {
    jest.clearAllMocks();
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
});
