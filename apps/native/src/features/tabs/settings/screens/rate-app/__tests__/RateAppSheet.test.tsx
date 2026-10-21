import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

const mockOpenStoreReviewPage = jest.fn();
const mockNetInfoFetch = jest.fn();

jest.mock("#/lib/reviewPrompt/storeLink", () => ({
  openStoreReviewPage: (...args: unknown[]) => mockOpenStoreReviewPage(...args),
}));

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: (...args: unknown[]) => mockNetInfoFetch(...args) },
}));

jest.mock("heroui-native/bottom-sheet", () => {
  const { View, Text } = require("react-native");
  const BottomSheet = ({ children, isOpen }: any) =>
    isOpen ? <View>{children}</View> : null;
  BottomSheet.Portal = ({ children }: any) => <View>{children}</View>;
  BottomSheet.Overlay = () => null;
  BottomSheet.Content = ({ children }: any) => <View>{children}</View>;
  BottomSheet.Title = ({ children }: any) => <Text>{children}</Text>;
  return { BottomSheet };
});

jest.mock("#/components/heroui/button", () => {
  const { Pressable, Text } = require("react-native");
  const Button = ({ children, onPress, accessibilityLabel }: any) => (
    <Pressable accessibilityLabel={accessibilityLabel} onPress={onPress}>
      {children}
    </Pressable>
  );
  Button.Label = ({ children }: any) => <Text>{children}</Text>;
  return { Button };
});

jest.mock("#/components/heroui/text", () => {
  const { Text } = require("react-native");
  return { Text };
});

/** Renders the weight so a test can tell a filled star from an outlined one. */
jest.mock("#/components/heroui/icon", () => {
  const { View } = require("react-native");
  return {
    Icon: ({ weight }: { weight?: string }) => (
      <View testID={`icon-${weight ?? "regular"}`} />
    ),
  };
});

import { RateAppSheet } from "../RateAppSheet";

const setPlatform = (os: "ios" | "android") => {
  Object.defineProperty(Platform, "OS", { configurable: true, value: os });
};

const onOpenChange = jest.fn();
const onSendFeedback = jest.fn();

const renderSheet = () =>
  render(
    <RateAppSheet
      isOpen
      onOpenChange={onOpenChange}
      onSendFeedback={onSendFeedback}
    />
  );

const filledStars = () => screen.queryAllByTestId("icon-fill").length;

beforeEach(() => {
  jest.clearAllMocks();
  setPlatform("android");
  mockOpenStoreReviewPage.mockResolvedValue(true);
  mockNetInfoFetch.mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
});

describe("RateAppSheet", () => {
  it("invites a rating before one is chosen, with no stars filled", async () => {
    await renderSheet();

    expect(screen.getByText("Rate your NewsSpend experience")).toBeTruthy();
    expect(filledStars()).toBe(0);
  });

  it("gives every star an accessible label", async () => {
    await renderSheet();

    for (const label of [
      "1 star",
      "2 stars",
      "3 stars",
      "4 stars",
      "5 stars",
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it.each([
    1, 3, 5,
  ])("fills stars 1 through %i when star %i is tapped", async (n) => {
    await renderSheet();

    await fireEvent.press(
      screen.getByLabelText(n === 1 ? "1 star" : `${n} stars`)
    );

    expect(filledStars()).toBe(n);
  });

  it("changes the message with the rating", async () => {
    await renderSheet();

    await fireEvent.press(screen.getByLabelText("3 stars"));
    expect(screen.getByText("Thanks for your feedback.")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("5 stars"));
    expect(screen.getByText("We love that you love NewsSpend!")).toBeTruthy();
  });

  it("labels the store button for Google Play on Android", async () => {
    setPlatform("android");
    await renderSheet();

    expect(screen.getByText("Rate on Google Play")).toBeTruthy();
  });

  it("labels the store button for the App Store on iOS", async () => {
    setPlatform("ios");
    await renderSheet();

    expect(screen.getByText("Rate on the App Store")).toBeTruthy();
  });

  it("opens the store from a 1-star rating: the rating never gates it", async () => {
    await renderSheet();
    await fireEvent.press(screen.getByLabelText("1 star"));

    await fireEvent.press(screen.getByText("Rate on Google Play"));

    expect(mockOpenStoreReviewPage).toHaveBeenCalledTimes(1);
  });

  it("opens the store even when no star was chosen", async () => {
    await renderSheet();

    await fireEvent.press(screen.getByText("Rate on Google Play"));

    expect(mockOpenStoreReviewPage).toHaveBeenCalledTimes(1);
  });

  it("says it is offline and does not open the store", async () => {
    mockNetInfoFetch.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });
    await renderSheet();

    await fireEvent.press(screen.getByText("Rate on Google Play"));

    expect(await screen.findByText("You're offline")).toBeTruthy();
    expect(
      screen.getByText(
        "Connect to the internet and try again to rate NewsSpend."
      )
    ).toBeTruthy();
    expect(mockOpenStoreReviewPage).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText("OK"));
    expect(screen.queryByText("You're offline")).toBeNull();
    expect(screen.getByText("Rate on Google Play")).toBeTruthy();
  });

  it("shows a friendly message, not an error, when the store cannot be opened", async () => {
    mockOpenStoreReviewPage.mockResolvedValue(false);
    await renderSheet();

    await fireEvent.press(screen.getByText("Rate on Google Play"));

    expect(
      await screen.findByText("We couldn't open the store right now.")
    ).toBeTruthy();
  });

  it("sends feedback to the team and closes", async () => {
    await renderSheet();

    await fireEvent.press(screen.getByText("Send feedback"));

    expect(onSendFeedback).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on Not now", async () => {
    await renderSheet();

    await fireEvent.press(screen.getByText("Not now"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("never mentions points, rewards or bonuses in any state", async () => {
    await renderSheet();
    const words = /\b(points?|earn|rewards?|bonus)\b/i;
    expect(JSON.stringify(screen.toJSON())).not.toMatch(words);

    for (const label of [
      "1 star",
      "2 stars",
      "3 stars",
      "4 stars",
      "5 stars",
    ]) {
      await fireEvent.press(screen.getByLabelText(label));
      expect(JSON.stringify(screen.toJSON())).not.toMatch(words);
    }
  });
});
