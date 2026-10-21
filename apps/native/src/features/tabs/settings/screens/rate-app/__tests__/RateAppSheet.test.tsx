import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { AccessibilityInfo, Platform } from "react-native";

const mockOpenStoreReviewPage = jest.fn();
const mockNetInfoFetch = jest.fn();

jest.mock("#/lib/reviewPrompt/storeLink", () => ({
  openStoreReviewPage: (...args: unknown[]) => mockOpenStoreReviewPage(...args),
}));

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: (...args: unknown[]) => mockNetInfoFetch(...args) },
}));

jest.mock("@gorhom/bottom-sheet", () => {
  const { View } = require("react-native");
  return { BottomSheetView: ({ children }: any) => <View>{children}</View> };
});

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

jest.mock("#/components/heroui/icon", () => {
  const { View } = require("react-native");
  return { Icon: () => <View /> };
});

import { RateAppSheet } from "../RateAppSheet";

const setPlatform = (os: "ios" | "android") => {
  Object.defineProperty(Platform, "OS", { configurable: true, value: os });
};

const onOpenChange = jest.fn();
const onSendFeedback = jest.fn();

const STAR_LABELS = ["1 star", "2 stars", "3 stars", "4 stars", "5 stars"];

const renderSheet = () =>
  render(
    <RateAppSheet
      isOpen
      onOpenChange={onOpenChange}
      onSendFeedback={onSendFeedback}
    />
  );

/** A star is filled exactly when it reports itself selected. */
const filledStars = () =>
  STAR_LABELS.filter(
    (label) => screen.getByLabelText(label).props.accessibilityState?.selected
  ).length;

const tapStar = (n: number) =>
  fireEvent.press(screen.getByLabelText(STAR_LABELS[n - 1] as string));

const rendered = () => JSON.stringify(screen.toJSON());

beforeEach(() => {
  jest.clearAllMocks();
  setPlatform("android");
  mockOpenStoreReviewPage.mockResolvedValue(true);
  mockNetInfoFetch.mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(false);
});

describe("RateAppSheet", () => {
  it("invites a rating before one is chosen, with no stars filled", async () => {
    await renderSheet();

    expect(screen.getByText("Rate your NewsSpend experience")).toBeTruthy();
    expect(filledStars()).toBe(0);
  });

  it("gives every star an accessible label", async () => {
    await renderSheet();

    for (const label of STAR_LABELS) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it.each([
    1, 3, 5,
  ])("fills stars 1 through %i when star %i is tapped", async (n) => {
    await renderSheet();

    await tapStar(n);

    expect(filledStars()).toBe(n);
  });

  it("changes the message with the rating", async () => {
    await renderSheet();

    await tapStar(3);
    expect(screen.getByText("Thanks for your feedback.")).toBeTruthy();

    await tapStar(5);
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

  it.each([
    0, 1, 2, 3, 4, 5,
  ])("keeps the store button on screen at %i stars: a rating never removes it", async (n) => {
    await renderSheet();
    if (n > 0) {
      await tapStar(n);
    }

    expect(screen.getByText("Rate on Google Play")).toBeTruthy();
  });

  it.each([
    1, 2, 3,
  ])("offers direct feedback first and the store second at %i stars", async (n) => {
    await renderSheet();
    await tapStar(n);

    expect(screen.getByText("Send direct feedback")).toBeTruthy();
    expect(rendered().indexOf("Send direct feedback")).toBeLessThan(
      rendered().indexOf("Rate on Google Play")
    );
  });

  it.each([
    4, 5,
  ])("offers the store first and feedback second at %i stars", async (n) => {
    await renderSheet();
    await tapStar(n);

    expect(screen.getByText("Send feedback")).toBeTruthy();
    expect(rendered().indexOf("Rate on Google Play")).toBeLessThan(
      rendered().indexOf("Send feedback")
    );
  });

  it("opens the store from a 1-star rating", async () => {
    await renderSheet();
    await tapStar(1);

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

  it("opens the store once when the button is tapped twice in a row", async () => {
    let release: () => void = () => {};
    mockNetInfoFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ isConnected: true, isInternetReachable: true });
        })
    );
    await renderSheet();

    const button = screen.getByText("Rate on Google Play");
    // The first press is still waiting on the connection check when the
    // second arrives; only then is the check allowed to finish.
    await act(async () => {
      const first = fireEvent.press(button);
      const second = fireEvent.press(button);
      release();
      await Promise.all([first, second]);
    });

    expect(mockNetInfoFetch).toHaveBeenCalledTimes(1);
    expect(mockOpenStoreReviewPage).toHaveBeenCalledTimes(1);
  });

  it("can open the store again after the first attempt has finished", async () => {
    await renderSheet();

    await fireEvent.press(screen.getByText("Rate on Google Play"));
    await fireEvent.press(screen.getByText("Rate on Google Play"));

    expect(mockOpenStoreReviewPage).toHaveBeenCalledTimes(2);
  });

  it("shows the friendly message when the connection check itself fails", async () => {
    mockNetInfoFetch.mockRejectedValue(new Error("native module unavailable"));
    await renderSheet();

    await fireEvent.press(screen.getByText("Rate on Google Play"));

    expect(
      await screen.findByText("We couldn't open the store right now.")
    ).toBeTruthy();
    expect(mockOpenStoreReviewPage).not.toHaveBeenCalled();
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

  describe("confetti", () => {
    it("plays at 5 stars", async () => {
      await renderSheet();

      await tapStar(5);

      expect(await screen.findByTestId("confetti")).toBeTruthy();
    });

    it.each([0, 1, 2, 3, 4])("stays off at %i stars", async (n) => {
      await renderSheet();
      if (n > 0) {
        await tapStar(n);
      }

      expect(screen.queryByTestId("confetti")).toBeNull();
    });

    it("stays off when the system asks for reduced motion", async () => {
      jest
        .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
        .mockResolvedValue(true);
      await renderSheet();

      await tapStar(5);
      // Wait for the setting to have been read, so "off" is a decision and
      // not just the state before the answer arrives.
      await waitFor(() =>
        expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled()
      );

      expect(screen.queryByTestId("confetti")).toBeNull();
    });
  });

  it("never mentions points, rewards or bonuses in any state", async () => {
    await renderSheet();
    const words = /\b(points?|earn|rewards?|bonus)\b/i;
    expect(rendered()).not.toMatch(words);

    for (const label of STAR_LABELS) {
      await fireEvent.press(screen.getByLabelText(label));
      expect(rendered()).not.toMatch(words);
    }
  });
});
