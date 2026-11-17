import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { EventDetailScreen } from "../EventDetail";
import { OrderScreen } from "../Order";

const mockRefetch = jest.fn();
const mockCheckout = jest.fn();
const mockNavigate = jest.fn();
const mockTrack = jest.fn();
const mockOpenAuth = jest.fn();

let mockUser: { isAnonymous?: boolean } | null = { isAnonymous: false };

type OrderState =
  | "pending"
  | "paid"
  | "expired"
  | "cancelled"
  | "refunded"
  | "failed";

type Order = {
  reference: string;
  orderReference: string | null;
  state: OrderState;
  eventId: string;
  eventName: string;
  sessionId: string;
  sessionAt: string;
  items: Array<{ type: string; quantity: number; unitPriceMinor: number }>;
  amountMinor: number;
  currency: string;
  refundedMinor: number;
  pointsAwarded: number;
  createdAt: string;
};

const order = (overrides: Partial<Order> = {}): Order => ({
  reference: "ref-1",
  orderReference: "ord-1",
  state: "pending",
  eventId: "evt-1",
  eventName: "Lagos Live",
  sessionId: "sess-1",
  sessionAt: "2026-12-01T19:00:00.000Z",
  items: [{ type: "tier-1", quantity: 2, unitPriceMinor: 500_000 }],
  amountMinor: 1_000_000,
  currency: "NGN",
  refundedMinor: 0,
  pointsAwarded: 0,
  createdAt: "2026-11-17T10:00:00.000Z",
  ...overrides,
});

let mockOrder: Order = order();

const mockEvent = {
  id: "evt-1",
  title: "Lagos Live",
  description: "A show",
  venue: "Eko Centre",
  city: "Lagos",
  imageUrl: null,
  startsAt: "2026-12-01T19:00:00.000Z",
  endsAt: null,
  currency: "NGN",
  fromPriceMinor: 500_000,
  free: false,
  onSale: true,
  pointsFrom: 150,
  sessions: [
    {
      id: "sess-1",
      eventId: "evt-1",
      startsAt: "2026-12-01T19:00:00.000Z",
      endsAt: null,
      currency: "NGN",
      fromPriceMinor: 500_000,
      revision: "rev-7",
    },
  ],
};

const mockInventory = {
  eventId: "evt-1",
  sessionId: "sess-1",
  currency: "NGN",
  updatedAt: null,
  available: 10,
  soldOut: false,
  tiers: [
    {
      id: "tier-1",
      name: "Regular",
      priceMinor: 500_000,
      available: 10,
      soldOut: false,
    },
  ],
};

jest.mock("@react-navigation/native", () => ({
  useIsFocused: () => true,
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: { id: "evt-1", reference: "ref-1" } }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: (options: { input?: Record<string, unknown> }) => {
    const input = options.input ?? {};
    if ("reference" in input) {
      return { data: mockOrder, isPending: false, refetch: mockRefetch };
    }
    if ("eventId" in input) {
      return { data: mockInventory, isPending: false, isError: false };
    }
    return { data: mockEvent, isPending: false };
  },
  useMutation: () => ({ mutateAsync: mockCheckout, isPending: false }),
}));

jest.mock("#/lib/orpc", () => ({
  orpc: {
    events: {
      get: { queryOptions: (options: unknown) => options },
      inventory: { queryOptions: (options: unknown) => options },
      order: { queryOptions: (options: unknown) => options },
      checkout: { mutationOptions: () => ({}) },
    },
  },
}));

jest.mock("#/lib/discoverAnalyticsClient", () => ({
  trackDiscover: (...args: unknown[]) => mockTrack(...args),
}));

jest.mock("#/lib/trackLegacyLink", () => ({ trackLegacyTabLink: jest.fn() }));

jest.mock("valtio", () => ({
  useSnapshot: () => ({ user: mockUser }),
}));
jest.mock("#/state/auth", () => ({ authState: {} }));

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuth(...args),
}));

jest.mock("#/components", () => ({ ScreenHeader: () => null }));
jest.mock("#/components/heroui/image", () => ({ Image: () => null }));
jest.mock("#/components/heroui/screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => {
    const { View } = require("react-native");
    return <View>{children}</View>;
  },
}));
jest.mock("#/components/heroui/text", () => ({
  Text: require("react-native").Text,
}));
jest.mock("#/components/heroui/button", () => {
  const { Pressable, Text } = require("react-native");
  const Button = ({
    children,
    isDisabled,
    onPress,
  }: {
    children: React.ReactNode;
    isDisabled?: boolean;
    onPress?: () => void;
  }) => (
    <Pressable disabled={isDisabled} onPress={onPress}>
      {children}
    </Pressable>
  );
  Button.Label = ({ children }: { children: React.ReactNode }) => (
    <Text>{children}</Text>
  );
  return { Button };
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockUser = { isAnonymous: false };
  mockOrder = order();
  mockCheckout.mockResolvedValue({
    reference: "ref-1",
    checkoutUrl: "https://shows.test/checkout/1",
    expiresAt: "2026-11-17T10:15:00.000Z",
  });
  mockOpenAuth.mockResolvedValue({ type: "success" });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("OrderScreen", () => {
  it("shows the confirming copy while the order is pending", async () => {
    await render(<OrderScreen />);

    expect(screen.getByText("Confirming your payment with Shows")).toBeTruthy();
  });

  it("shows the points once the order is paid, recording it once", async () => {
    mockOrder = order({ state: "paid", pointsAwarded: 150 });

    const view = await render(<OrderScreen />);
    view.rerender(<OrderScreen />);

    expect(screen.getByText("+150 Dream Points")).toBeTruthy();
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith({
      event: "open",
      itemType: "event",
      itemId: "ref-1",
    });
  });

  it("shows the reversal and no positive points after a refund", async () => {
    mockOrder = order({
      state: "refunded",
      refundedMinor: 500_000,
      pointsAwarded: 150,
    });

    await render(<OrderScreen />);

    expect(screen.getByText("Refunded ₦5,000")).toBeTruthy();
    expect(screen.queryByText("+150 Dream Points")).toBeNull();
  });

  it("stops polling once the order is paid", async () => {
    const view = await render(<OrderScreen />);

    await act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    mockOrder = order({ state: "paid", pointsAwarded: 100 });
    await act(() => {
      view.rerender(<OrderScreen />);
    });

    await act(() => {
      jest.advanceTimersByTime(20_000);
    });
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});

describe("EventDetail checkout", () => {
  it("sends a guest to sign in instead of checking out", async () => {
    mockUser = { isAnonymous: true };

    await render(<EventDetailScreen />);

    await fireEvent.press(screen.getByText("Regular"));
    await fireEvent.press(screen.getByText("Continue"));

    expect(mockCheckout).not.toHaveBeenCalled();
    expect(mockOpenAuth).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("SignIn", { redirect: true });
  });
});
