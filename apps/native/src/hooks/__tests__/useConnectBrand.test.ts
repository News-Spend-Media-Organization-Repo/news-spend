import { act, renderHook } from "@testing-library/react-native";

import { useConnectBrand } from "../discover/useConnectBrand";

const yesterday = () =>
  new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
const today = () => new Date().toDateString();

const state: { value?: { count: number; date: string } } = {};
const mockNavigate = jest.fn();
const mockToastError = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: (...args: unknown[]) => mockNavigate(...args),
  }),
}));

jest.mock("react-native-mmkv", () => {
  const React = require("react");
  return {
    useMMKVObject: () => {
      const [value, setValue] = React.useState(state.value);
      const setData = (
        updater:
          | { count: number; date: string }
          | ((prev: { count: number; date: string } | undefined) => {
              count: number;
              date: string;
            })
      ) =>
        setValue((prev: { count: number; date: string } | undefined) =>
          typeof updater === "function" ? updater(prev) : updater
        );
      return [value, setData];
    },
  };
});

jest.mock("#/components/heroui/toast", () => ({
  toast: {
    success: jest.fn(),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

jest.mock("#/hooks/point/useAddActivity", () => ({
  __esModule: true,
  default: () => ({
    mutate: (
      _input: unknown,
      callbacks?: { onSuccess?: (r: unknown) => void }
    ) => callbacks?.onSuccess?.({ pointsAwarded: 10 }),
  }),
}));

jest.mock("#/state/auth", () => ({
  authState: { user: { id: "user-1" } },
}));

describe("useConnectBrand", () => {
  beforeEach(() => {
    state.value = undefined;
    mockNavigate.mockClear();
    mockToastError.mockClear();
  });

  it("still opens once today's eight are used, with a limit notice", async () => {
    state.value = { count: 8, date: today() };
    const { result } = await renderHook(() => useConnectBrand());

    expect(result.current.onOpen()).toBe(true);
    expect(mockToastError).toHaveBeenCalled();
  });

  it("sends every fourth open to the app wall", async () => {
    state.value = { count: 3, date: today() };
    const { result } = await renderHook(() => useConnectBrand());

    let opened: boolean | undefined;
    await act(() => {
      opened = result.current.onOpen();
    });

    expect(opened).toBe(false);
    expect(mockNavigate).toHaveBeenCalledWith("LuckyAppWall");
  });

  it("starts a new day from zero after a maxed-out yesterday", async () => {
    state.value = { count: 8, date: yesterday() };
    const { result } = await renderHook(() => useConnectBrand());

    expect(result.current.canEarnPoints).toBe(true);

    await act(() => result.current.onCountdownComplete());

    // Yesterday's 8 must not become today's 9, which would lock the day out
    // after a single ad.
    expect(result.current.canEarnPoints).toBe(true);
  });

  it("still stops once today's own eight are used", async () => {
    state.value = { count: 7, date: today() };
    const { result } = await renderHook(() => useConnectBrand());

    await act(() => result.current.onCountdownComplete());

    expect(result.current.canEarnPoints).toBe(false);
  });
});
