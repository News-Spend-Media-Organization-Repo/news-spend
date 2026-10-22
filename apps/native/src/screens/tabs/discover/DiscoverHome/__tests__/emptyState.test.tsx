import { render, screen } from "@testing-library/react-native";

import { ALL_OFFERS_DONE_MESSAGE, AllTab } from "../components/all-tab";

type Result = {
  data?: unknown;
  isPending: boolean;
  error: unknown;
  isRefetching: boolean;
  refetch: () => void;
};

const settled = (data: unknown): Result => ({
  data,
  isPending: false,
  error: null,
  isRefetching: false,
  refetch: jest.fn(),
});

let mockResults: Result[] = [];

jest.mock("@tanstack/react-query", () => ({
  useQueries: ({ combine }: { combine: (r: Result[]) => unknown }) =>
    combine(mockResults),
}));

jest.mock("#/lib/orpc", () => {
  const options = () => ({ queryKey: ["k"] });
  const proc = { queryOptions: options, queryKey: () => ["k"] };
  return {
    orpc: {
      partnerContent: { filtered: proc },
      survey: { cpx: { getSurveys: proc } },
    },
  };
});

jest.mock("#/hooks/usePartnerClick", () => ({
  usePartnerClick: () => ({ handleClick: jest.fn(), isLoading: () => false }),
}));

jest.mock("#/state/auth", () => ({ authState: { user: { id: "u1" } } }));
jest.mock("valtio", () => ({
  useSnapshot: (state: unknown) => state,
  proxy: (o: unknown) => o,
}));
jest.mock("#/state/route-state", () => ({ useTabBarHeight: () => 0 }));
jest.mock("#/lib/discoverAnalyticsClient", () => ({
  trackDiscover: jest.fn(),
}));
jest.mock("#/features/games/openGame", () => ({ openGame: jest.fn() }));
jest.mock("#/navigation/navigationUtils", () => ({ navigationRef: {} }));
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => true }));
jest.mock("#/components/heroui/text", () => ({
  Text: require("react-native").Text,
}));
jest.mock("#/components/heroui/image", () => ({
  Image: () => null,
}));
jest.mock("#/components/heroui/button", () => {
  const { Text } = require("react-native");
  const Button = ({ children }: { children: React.ReactNode }) => children;
  Button.Label = Text;
  return { Button };
});
// Every `heroui-native/*` specifier resolves to one shared mock file, so a
// single mock supplies all the pieces this screen touches.
jest.mock("heroui-native", () => ({
  Skeleton: ({ children }: { children: React.ReactNode }) => children,
  Card: ({ children }: { children: React.ReactNode }) => children,
  PressableFeedback: ({ children }: { children: React.ReactNode }) => children,
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));
jest.mock("../components/game-item", () => {
  const { Text } = require("react-native");
  return { GameItem: () => <Text>game</Text> };
});
jest.mock("../components/app-item", () => {
  const { Text } = require("react-native");
  return { AppItem: () => <Text>app</Text> };
});
jest.mock("../components/pull-to-refresh-indicator", () => ({
  PullToRefreshIndicator: () => null,
  triggerRefreshHaptic: jest.fn(),
}));

// The list renders every row eagerly; virtualization is not under test.
jest.mock("react-native-collapsible-tab/legend-list", () => {
  const { View } = require("react-native");
  return {
    TabLegendList: ({
      data,
      renderItem,
    }: {
      data: unknown[];
      renderItem: (p: { item: unknown }) => React.ReactNode;
    }) => (
      <View>
        {data.map((item, i) => (
          <View key={String(i)}>{renderItem({ item })}</View>
        ))}
      </View>
    ),
  };
});
jest.mock("@legendapp/list/react-native", () => ({
  LegendList: () => null,
}));
jest.mock("react-native-gesture-handler", () => ({
  ScrollView: ({ children }: { children: React.ReactNode }) => children,
}));

const offer = (id: string) => ({
  id,
  title: `Offer ${id}`,
  condition: "Do a thing",
  points: 100,
});

describe("Discover all tab empty state", () => {
  it("shows one message and hides the offer sections when nothing is left", async () => {
    mockResults = [settled({ docs: [] }), settled({ docs: [] }), settled([])];
    await render(<AllTab />);

    expect(screen.getByText(ALL_OFFERS_DONE_MESSAGE)).toBeTruthy();
    expect(screen.queryByText("Apps")).toBeNull();
    expect(screen.queryByText("Books")).toBeNull();
    // Games and surveys are not partner offers: still on screen.
    expect(screen.getByText("Games")).toBeTruthy();
    expect(screen.getByText("Surveys")).toBeTruthy();
  });

  it("hides just the empty offer section when another still has offers", async () => {
    mockResults = [
      settled({ docs: [offer("a")] }),
      settled({ docs: [] }),
      settled([]),
    ];
    await render(<AllTab />);

    expect(screen.queryByText(ALL_OFFERS_DONE_MESSAGE)).toBeNull();
    expect(screen.getByText("Apps")).toBeTruthy();
    expect(screen.queryByText("Books")).toBeNull();
  });

  it("shows no message while a section is still loading", async () => {
    mockResults = [
      { ...settled(undefined), isPending: true },
      settled({ docs: [] }),
      settled([]),
    ];
    await render(<AllTab />);

    expect(screen.queryByText(ALL_OFFERS_DONE_MESSAGE)).toBeNull();
    expect(screen.getByText("Apps")).toBeTruthy();
  });

  it("shows no message when a section errored", async () => {
    mockResults = [
      { ...settled(undefined), error: new Error("boom") },
      settled({ docs: [] }),
      settled([]),
    ];
    await render(<AllTab />);

    expect(screen.queryByText(ALL_OFFERS_DONE_MESSAGE)).toBeNull();
    expect(screen.getByText("Failed to load")).toBeTruthy();
  });

  it("keeps the message away while surveys are still available", async () => {
    mockResults = [
      settled({ docs: [] }),
      settled({ docs: [] }),
      settled([{ payout: 10, loi: 5, href: "x" }]),
    ];
    await render(<AllTab />);

    expect(screen.queryByText(ALL_OFFERS_DONE_MESSAGE)).toBeNull();
  });
});
