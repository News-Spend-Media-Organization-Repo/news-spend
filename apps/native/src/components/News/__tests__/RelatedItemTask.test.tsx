import { fireEvent, render, screen } from "@testing-library/react-native";

const mockHandleClick = jest.fn();

jest.mock("#/hooks/usePartnerClick", () => ({
  usePartnerClick: () => ({ handleClick: mockHandleClick }),
}));
jest.mock("#/components/ui", () => {
  const { View } = require("react-native");
  return { Image: () => <View /> };
});
jest.mock("#/utils/getImageData", () => ({
  getImageData: () => ({ url: "https://img/x.png", blurhash: undefined }),
}));

import { RelatedItemTask } from "../RelatedItemTask";

describe("RelatedItemTask", () => {
  it("records the tap through usePartnerClick on the homepage placement", async () => {
    const item = { id: "p1", condition: "Install the app" } as never;
    await render(<RelatedItemTask item={item} />);

    await fireEvent.press(screen.getByText("Install the app"));

    expect(mockHandleClick).toHaveBeenCalledWith(item, "homepage-ads-banner");
  });
});
