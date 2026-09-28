import { fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions } from "react-native";
import { markOnboardingSeen } from "#/state/onboarding";
import Onboarding from "../onboarding";

const mockReplace = jest.fn();
const mockNavigate = jest.fn();

jest.mock("@react-navigation/native", () => ({
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
  seenOnboardingAtLaunch: false,
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
  it("shows the first page with its progress label and a skip", () => {
    render(<Onboarding />);

    expect(
      screen.getByText("Your Time Online Should Move Your Life Forward")
    ).toBeTruthy();
    expect(screen.getByLabelText("Onboarding screen 1 of 3")).toBeTruthy();
    expect(screen.getByLabelText("Skip onboarding")).toBeTruthy();
    expect(screen.queryByText("Log In")).toBeNull();
  });

  it("swaps the footer content as the carousel moves", () => {
    render(<Onboarding />);

    expect(screen.getByText("Move Your Life Forward")).toBeTruthy();

    swipeToPage(1);
    expect(screen.getByText("Continue")).toBeTruthy();
    expect(screen.getByLabelText("Onboarding screen 2 of 3")).toBeTruthy();

    swipeToPage(2);
    expect(screen.getByText("Create an Account")).toBeTruthy();
    expect(screen.getByText("Log In")).toBeTruthy();
    expect(screen.getByLabelText("Onboarding screen 3 of 3")).toBeTruthy();
  });

  it("records the flag and hands off to sign up from the last page", () => {
    render(<Onboarding />);
    swipeToPage(2);

    fireEvent.press(screen.getByText("Create an Account"));

    expect(markOnboardingSeen).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("TOS", { goto: "SignUp" });
  });

  it("records the flag and hands off to log in from the last page", () => {
    render(<Onboarding />);
    swipeToPage(2);

    fireEvent.press(screen.getByText("Log In"));

    expect(markOnboardingSeen).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("TOS", { goto: "SignIn" });
  });

  it("skips to Welcome and records the flag", () => {
    render(<Onboarding />);

    fireEvent.press(screen.getByLabelText("Skip onboarding"));

    expect(markOnboardingSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("Welcome");
  });

  it("does not record the flag while paging forward", () => {
    render(<Onboarding />);

    swipeToPage(1);

    expect(markOnboardingSeen).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
