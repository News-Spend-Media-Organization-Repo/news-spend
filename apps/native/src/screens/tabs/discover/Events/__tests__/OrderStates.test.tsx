import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import { EventDetailScreen } from "../EventDetail";
import { OrderScreen } from "../Order";

jest.mock("@orpc/client", () => ({
  isDefinedError: (error: { defined?: boolean }) => error?.defined === true,
}));

const mockRefetch = jest.fn();
const mockCheckout = jest.fn();
const mockNavigate = jest.fn();
const mockTrack = jest.fn();
const mockOpenAuth = jest.fn();
const mockEventRefetch = jest.fn();
const mockInventoryRefetch = jest.fn();

let mockUser: { isAnonymous?: boolean } | null = { isAnonymous: false };
let mockFocused = true;
let mockOrderError: Error | null = null;
let mockOrderDropped = false;
let mockEventError: Error | null = null;
let mockEventDropped = false;

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
  useIsFocused: () => mockFocused,
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: { id: "evt-1", reference: "ref-1" } }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: (options: { input?: Record<string, unknown> }) => {
    const input = options.input ?? {};
    if ("reference" in input) {
      return {
        data: mockOrderDropped ? undefined : mockOrder,
        error: mockOrderError,
        isError: mockOrderError !== null,
        isPending: false,
        refetch: mockRefetch,
      };
    }
    if ("eventId" in input) {
      return {
        data: mockInventory,
        isPending: false,
        isError: false,
        refetch: mockInventoryRefetch,
      };
    }
    return {
      data: mockEventDropped ? undefined : mockEvent,
      error: mockEventError,
      isError: mockEventError !== null,
      isPending: false,
      refetch: mockEventRefetch,
    };
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
  mockFocused = true;
  mockOrderError = null;
  mockOrderDropped = false;
  mockEventError = null;
  mockEventDropped = false;
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

  it("shows the points once the order is paid, without a fake open", async () => {
    mockOrder = order({ state: "paid", pointsAwarded: 150 });

    const view = await render(<OrderScreen />);
    view.rerender(<OrderScreen />);

    expect(screen.getByText("+150 Dream Points")).toBeTruthy();
    expect(mockTrack).not.toHaveBeenCalled();
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

  it("stops polling when the screen loses focus", async () => {
    const view = await render(<OrderScreen />);

    await act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    mockFocused = false;
    await act(() => {
      view.rerender(<OrderScreen />);
    });

    await act(() => {
      jest.advanceTimersByTime(15_000);
    });
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("keeps a pending order on screen when a poll fails", async () => {
    const view = await render(<OrderScreen />);
    expect(screen.getByText("Confirming your payment with Shows")).toBeTruthy();

    mockOrderError = new Error("network");
    await act(() => {
      view.rerender(<OrderScreen />);
    });

    expect(screen.getByText("Confirming your payment with Shows")).toBeTruthy();
    expect(screen.queryByText("We couldn't load this order")).toBeNull();
  });

  it("offers a retry for a failed load instead of calling it not found", async () => {
    mockOrderDropped = true;
    mockOrderError = new Error("network");

    await render(<OrderScreen />);

    expect(screen.getByText("We couldn't load this order")).toBeTruthy();
    expect(screen.queryByText("Order not found")).toBeNull();

    await fireEvent.press(screen.getByText("Retry"));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows not-found copy only for a NOT_FOUND response", async () => {
    mockOrderDropped = true;
    mockOrderError = Object.assign(new Error("Order not found"), {
      code: "NOT_FOUND",
      defined: true,
    });

    await render(<OrderScreen />);

    expect(screen.getByText("Order not found")).toBeTruthy();
    expect(screen.queryByText("Retry")).toBeNull();
  });

  it("asks a signed-out buyer to sign in rather than calling it a failure", async () => {
    mockOrderDropped = true;
    mockOrderError = Object.assign(new Error("Unauthorized"), {
      code: "UNAUTHORIZED",
      defined: true,
    });

    await render(<OrderScreen />);

    expect(screen.getByText("Sign in to see this order")).toBeTruthy();
    expect(screen.queryByText("We couldn't load this order")).toBeNull();

    await fireEvent.press(screen.getByText("Sign in"));
    expect(mockNavigate).toHaveBeenCalledWith("SignIn", { redirect: true });
  });
});

describe("EventDetail load states", () => {
  it("offers a retry instead of not-found when the event fails to load", async () => {
    mockEventDropped = true;
    mockEventError = new Error("network");

    await render(<EventDetailScreen />);

    expect(screen.getByText("We couldn't load this event")).toBeTruthy();
    expect(screen.queryByText("Event not found")).toBeNull();

    await fireEvent.press(screen.getByText("Retry"));
    expect(mockEventRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows not-found copy only for a NOT_FOUND response", async () => {
    mockEventDropped = true;
    mockEventError = Object.assign(new Error("Event not found"), {
      code: "NOT_FOUND",
      defined: true,
    });

    await render(<EventDetailScreen />);

    expect(screen.getByText("Event not found")).toBeTruthy();
    expect(screen.queryByText("Retry")).toBeNull();
  });
});

describe("EventDetail checkout", () => {
  beforeEach(() => {
    // These tests await the checkout promise chain; real timers let `waitFor`
    // drive it without the poll interval's fake clock.
    jest.useRealTimers();
  });

  it("sends a guest to sign in instead of checking out", async () => {
    mockUser = { isAnonymous: true };

    await render(<EventDetailScreen />);

    await fireEvent.press(screen.getByText("Regular"));
    await fireEvent.press(screen.getByText("Continue"));

    expect(mockCheckout).not.toHaveBeenCalled();
    expect(mockOpenAuth).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("SignIn", { redirect: true });
  });

  it("opens checkout with the registered return link and shows the order", async () => {
    await render(<EventDetailScreen />);

    await fireEvent.press(screen.getByText("Regular"));
    await fireEvent.press(screen.getByText("Continue"));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("Order", {
        reference: "ref-1",
      })
    );
    expect(mockOpenAuth).toHaveBeenCalledWith(
      "https://shows.test/checkout/1",
      "https://link.newsspend.com/events/return",
      { preferUniversalLinks: true }
    );
  });

  it("navigates with the raw reference so the in-app lookup matches", async () => {
    mockCheckout.mockResolvedValue({
      reference: "ref/1?x",
      checkoutUrl: "https://shows.test/checkout/1",
      expiresAt: "2026-11-17T10:15:00.000Z",
    });

    await render(<EventDetailScreen />);

    await fireEvent.press(screen.getByText("Regular"));
    await fireEvent.press(screen.getByText("Continue"));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("Order", {
        reference: "ref/1?x",
      })
    );
  });

  it("navigates to the order even when the auth session is dismissed", async () => {
    mockOpenAuth.mockResolvedValue({ type: "dismiss" });

    await render(<EventDetailScreen />);

    await fireEvent.press(screen.getByText("Regular"));
    await fireEvent.press(screen.getByText("Continue"));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("Order", {
        reference: "ref-1",
      })
    );
    expect(
      screen.queryByText(
        "Checkout closed. You can try again whenever you're ready."
      )
    ).toBeNull();
  });

  it("only shows the closed notice when there is no order to open", async () => {
    mockCheckout.mockResolvedValue({
      reference: "",
      checkoutUrl: "https://shows.test/checkout/1",
      expiresAt: "2026-11-17T10:15:00.000Z",
    });

    await render(<EventDetailScreen />);

    await fireEvent.press(screen.getByText("Regular"));
    await fireEvent.press(screen.getByText("Continue"));

    expect(
      await screen.findByText(
        "Checkout closed. You can try again whenever you're ready."
      )
    ).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalledWith("Order", expect.anything());
  });

  it("reports sold-out stock and clears the selection", async () => {
    mockCheckout.mockRejectedValue(
      Object.assign(new Error("Those tickets are no longer available"), {
        code: "INSUFFICIENT_STOCK",
        defined: true,
      })
    );

    await render(<EventDetailScreen />);

    await fireEvent.press(screen.getByText("Regular"));
    await fireEvent.press(screen.getByLabelText("More tickets"));
    await fireEvent.press(screen.getByText("Continue"));

    expect(
      await screen.findByText("Those tickets are no longer available")
    ).toBeTruthy();
    expect(mockInventoryRefetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Fewer tickets")).toBeNull();
  });

  it("shows the order total and keeps the quantity on a re-tap", async () => {
    await render(<EventDetailScreen />);

    await fireEvent.press(screen.getByText("Regular"));
    await fireEvent.press(screen.getByLabelText("More tickets"));

    expect(screen.getByText("Total")).toBeTruthy();
    expect(screen.getByText("₦10,000")).toBeTruthy();

    // Tapping the tier already chosen must not reset it to one.
    await fireEvent.press(screen.getByText("Regular"));
    expect(screen.getByText("₦10,000")).toBeTruthy();
  });
});
