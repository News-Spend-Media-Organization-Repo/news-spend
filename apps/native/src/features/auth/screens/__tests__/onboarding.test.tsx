import { fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions } from "react-native";
import { markOnboardingSeen } from "#/state/onboarding";
import Onboarding from "../onboarding";

const mockReplace = jest.fn();
const mockNavigate = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useIsFocused: jest.fn(() => true),
  useNavigation: jest.fn(() => ({
    navigate: mockNavigate,
    replace: mockReplace,
  })),
  useRoute: jest.fn(() => ({ params: {} })),
}));

jest.mock("#/hooks/useMarkInteractive", () => ({
  useMarkInteractive: jest.fn(),
}));

jest.mock("#/state/onboarding", () => ({
  markOnboardingSeen: jest.fn(),
}));

const pageWidth = Dimensions.get("window").width;

/** Paging only settles on whole pages, which is what this event reports. */
const swipeToPage = (index: number) =>
  fireEvent(screen.getByTestId("onboarding-pages"), "momentumScrollEnd", {
    nativeEvent: { contentOffset: { x: pageWidth * index } },
  });

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Onboarding", () => {
  it("shows the first page with its progress label and a skip", async () => {
    await render(<Onboarding />);

    expect(
      screen.getByText("Your Time Online Should Move Your Life Forward")
    ).toBeTruthy();
    expect(screen.getByText("Move Your Life Forward")).toBeTruthy();
    expect(screen.getByLabelText("Onboarding screen 1 of 3")).toBeTruthy();
    expect(screen.getByLabelText("Skip onboarding")).toBeTruthy();
  });

  it("advances its one CTA as the carousel moves", async () => {
    await render(<Onboarding />);

    expect(screen.getByText("Move Your Life Forward")).toBeTruthy();

    await swipeToPage(1);
    expect(screen.getByText("Continue")).toBeTruthy();
    expect(screen.getByLabelText("Onboarding screen 2 of 3")).toBeTruthy();
    expect(screen.queryByText("Get Started")).toBeNull();

    await swipeToPage(2);
    expect(screen.getByText("Get Started")).toBeTruthy();
    expect(screen.getByLabelText("Onboarding screen 3 of 3")).toBeTruthy();
    expect(screen.queryByText("Continue")).toBeNull();
    // Skip lands where the CTA lands, so it stands down on this page.
    expect(screen.getByLabelText("Skip onboarding")).toBeDisabled();
  });

  it("hands off to Welcome from the last page and records the flag", async () => {
    await render(<Onboarding />);
    await swipeToPage(2);

    await fireEvent.press(screen.getByText("Get Started"));

    expect(markOnboardingSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("Welcome");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("skips to Welcome and records the flag", async () => {
    await render(<Onboarding />);

    await fireEvent.press(screen.getByLabelText("Skip onboarding"));

    expect(markOnboardingSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("Welcome");
  });

  it("does not record the flag while paging forward", async () => {
    await render(<Onboarding />);

    await swipeToPage(1);

    expect(markOnboardingSeen).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
