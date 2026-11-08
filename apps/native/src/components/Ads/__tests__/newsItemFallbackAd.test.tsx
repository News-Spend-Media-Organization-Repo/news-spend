import { render, screen } from "@testing-library/react-native";

type Result = { data?: unknown; isPending: boolean };

let mockResult: Result = { isPending: true };

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => mockResult,
}));

jest.mock("#/lib/orpc", () => {
  const proc = {
    queryOptions: () => ({ queryKey: ["partnerContent", "getOne"] }),
  };
  return { orpc: { partnerContent: { getOne: proc } } };
});

jest.mock("../NewsItemAd", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: () => <View testID="partner-ad" /> };
});

jest.mock("#/components/heroui/text", () => ({
  Text: require("react-native").Text,
}));

import { AD_SLOT_HEIGHT } from "../adSlot";
import NewsItemFallbackAd from "../NewsItemFallbackAd";

/**
 * The slot is one row in the feed, handed to the partner only after Google
 * has failed. Every state it passes through has to reserve the same height, or
 * the row collapses and reopens under the reader's thumb.
 */
describe("NewsItemFallbackAd", () => {
  it("holds the reserved height while the partner pick is in flight", async () => {
    mockResult = { isPending: true };

    await render(<NewsItemFallbackAd slotId="slot-2" />);

    expect(screen.getByTestId("ad-placeholder").props.style.minHeight).toBe(
      AD_SLOT_HEIGHT
    );
  });

  it("serves the partner ad inside a box of the same height", async () => {
    mockResult = { data: { title: "Partner" }, isPending: false };

    await render(<NewsItemFallbackAd slotId="slot-3" />);

    expect(screen.getByTestId("partner-ad")).toBeTruthy();
    expect(screen.getByTestId("partner-ad-slot").props.style.minHeight).toBe(
      AD_SLOT_HEIGHT
    );
    expect(screen.queryByTestId("ad-placeholder")).toBeNull();
  });

  it("takes up no space once the query settles without an ad", async () => {
    mockResult = { isPending: false };

    const { toJSON } = await render(<NewsItemFallbackAd slotId="slot-4" />);

    expect(toJSON()).toBeNull();
  });
});
