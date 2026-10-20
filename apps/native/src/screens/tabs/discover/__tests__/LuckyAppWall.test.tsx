import { render, screen } from "@testing-library/react-native";

import LuckyAppWall, { LUCKY_WALL_EMPTY_MESSAGE } from "../LuckyAppWall";

let mockQuery: { data?: unknown; isPending: boolean; refetch: () => void } = {
  data: { docs: [] },
  isPending: false,
  refetch: jest.fn(),
};

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => mockQuery,
}));
jest.mock("#/lib/orpc", () => ({
  orpc: {
    partnerContent: {
      filtered: { queryOptions: () => ({}), queryKey: () => ["k"] },
    },
  },
}));
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({}) }));
jest.mock("valtio", () => ({
  useSnapshot: (state: unknown) => state,
  proxy: (o: unknown) => o,
}));
jest.mock("#/state/auth", () => ({ authState: { user: { id: "u1" } } }));
jest.mock("#/hooks/usePartnerClick", () => ({
  usePartnerClick: () => ({ handleClick: jest.fn() }),
}));
jest.mock("#/hooks/useRefreshByUser", () => ({
  useRefreshByUser: () => ({
    isRefetchingByUser: false,
    refetchByUser: jest.fn(),
  }),
}));
jest.mock("#/components", () => ({ ScreenHeader: () => null }));
jest.mock("@legendapp/list/react-native", () => {
  const { View } = require("react-native");
  return {
    LegendList: ({
      data,
      renderItem,
      ListEmptyComponent,
    }: {
      data: unknown[];
      renderItem: (p: { item: unknown }) => React.ReactNode;
      ListEmptyComponent: () => React.ReactNode;
    }) => (
      <View>
        {data.length === 0
          ? ListEmptyComponent()
          : data.map((item, i) => (
              <View key={String(i)}>{renderItem({ item })}</View>
            ))}
      </View>
    ),
  };
});

describe("LuckyAppWall", () => {
  it("explains an empty wall", async () => {
    mockQuery = { data: { docs: [] }, isPending: false, refetch: jest.fn() };
    await render(<LuckyAppWall />);

    expect(screen.getByText(LUCKY_WALL_EMPTY_MESSAGE)).toBeTruthy();
  });

  it("tags an offer that is awaiting confirmation", async () => {
    mockQuery = {
      data: {
        docs: [
          {
            id: "a",
            title: "Pending one",
            description: "d",
            userState: "pending",
          },
          { id: "b", title: "Fresh one", description: "d" },
        ],
      },
      isPending: false,
      refetch: jest.fn(),
    };
    await render(<LuckyAppWall />);

    expect(screen.getAllByText("Pending confirmation")).toHaveLength(1);
  });

  const makeDocs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `id-${i}`,
      title: `Offer ${i}`,
      description: "d",
    }));

  it("shows 10 of the 15 offers returned", async () => {
    mockQuery = {
      data: { docs: makeDocs(15) },
      isPending: false,
      refetch: jest.fn(),
    };
    await render(<LuckyAppWall />);

    expect(screen.getAllByText(/^Offer \d+$/)).toHaveLength(10);
  });

  it("shows every offer when fewer than 10 are returned", async () => {
    mockQuery = {
      data: { docs: makeDocs(4) },
      isPending: false,
      refetch: jest.fn(),
    };
    await render(<LuckyAppWall />);

    expect(screen.getAllByText(/^Offer \d+$/)).toHaveLength(4);
  });

  it("keeps the same offers across a re-render", async () => {
    const data = { docs: makeDocs(15) };
    mockQuery = { data, isPending: false, refetch: jest.fn() };
    const view = await render(<LuckyAppWall />);
    const titles = () =>
      screen.getAllByText(/^Offer \d+$/).map((n) => n.props.children);
    const before = titles();

    await view.rerender(<LuckyAppWall />);

    expect(titles()).toEqual(before);
  });
});
