import { fireEvent, render, screen } from "@testing-library/react-native";

const mockHandleClick = jest.fn();

jest.mock("#/hooks/usePartnerClick", () => ({
  usePartnerClick: () => ({ handleClick: mockHandleClick }),
}));
jest.mock("#/utils/getImageData", () => ({
  getImageData: () => ({ url: "https://img/x.png", blurhash: undefined }),
}));
jest.mock("../../heroui/image", () => ({ Image: () => null }));
jest.mock("react-native-gesture-handler", () => ({
  ScrollView: require("react-native").ScrollView,
}));
jest.mock("@legendapp/list/react-native", () => {
  const { View } = require("react-native");
  return {
    LegendList: ({
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

import TrendingBooks from "../TrendingBooks";

describe("TrendingBooks", () => {
  it("records the tap through usePartnerClick on the trending books placement", async () => {
    const item = { id: "b1", condition: "A book" } as never;

    await render(<TrendingBooks books={[item]} />);
    await fireEvent.press(screen.getByText("A book"));

    expect(mockHandleClick).toHaveBeenCalledWith(
      item,
      "homepage-trending-books"
    );
  });
});
