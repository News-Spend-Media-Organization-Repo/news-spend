import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";

import { useEvents } from "../useEvents";

const mockList = jest.fn();
let mockOptions: { input: (cursor: string | undefined) => unknown } | undefined;

jest.mock("#/lib/orpc", () => ({
  client: {
    events: {
      list: (input: unknown, options: unknown) => mockList(input, options),
    },
  },
  orpc: {
    events: {
      list: {
        infiniteOptions: (options: {
          input: (cursor: string | undefined) => unknown;
        }) => {
          mockOptions = options;
          return { ...options, queryKey: ["events"] };
        },
      },
    },
  },
}));

const event = {
  id: "evt-1",
  title: "Lagos Live",
  description: null,
  venue: "Eko Centre",
  city: "Lagos",
  category: "music",
  imageUrl: null,
  startsAt: "2026-12-01T19:00:00.000Z",
  endsAt: null,
  currency: "NGN",
  fromPriceMinor: 500_000,
  free: false,
  onSale: true,
  pointsFrom: 150,
};

describe("useEvents", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    mockList.mockReset();
    mockOptions = undefined;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("asks for twenty events a page", async () => {
    mockList.mockResolvedValueOnce({ data: [event], nextCursor: null });

    const { result } = await renderHook(() => useEvents(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockOptions?.input(undefined)).toEqual({
      limit: 20,
      cursor: undefined,
    });
    expect(mockList.mock.calls[0]?.[0]).toEqual({
      limit: 20,
      cursor: undefined,
    });
  });

  it("walks empty pages until it finds an event", async () => {
    mockList
      .mockResolvedValueOnce({ data: [], nextCursor: "c" })
      .mockResolvedValueOnce({ data: [], nextCursor: "c" })
      .mockResolvedValueOnce({ data: [event], nextCursor: null });

    const { result } = await renderHook(() => useEvents(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockList).toHaveBeenCalledTimes(3);
    expect(result.current.data?.pages.flatMap((page) => page.data)).toEqual([
      event,
    ]);
  });

  it("stops after five fetches when the cursor keeps repeating", async () => {
    mockList.mockResolvedValue({ data: [], nextCursor: "same" });

    const { result } = await renderHook(() => useEvents(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockList).toHaveBeenCalledTimes(5);
  });
});
