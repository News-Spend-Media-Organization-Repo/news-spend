import { fireEvent, render, screen } from "@testing-library/react-native";
import { markOnboardingSeen } from "#/state/onboarding";
import Onboarding from "../onboarding";
import OnboardingThree from "../onboarding-three";
import OnboardingTwo from "../onboarding-two";

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Onboarding", () => {
  it("renders the first screen with its progress label", () => {
    render(<Onboarding />);

    expect(
      screen.getByText("Your Time Online Should Move Your Life Forward")
    ).toBeTruthy();
    expect(screen.getByLabelText("Onboarding screen 1 of 3")).toBeTruthy();
  });

  it("keeps moving forward through replace, so back never rewinds", () => {
    render(<Onboarding />);

    fireEvent.press(screen.getByText("Move Your Life Forward"));

    expect(mockReplace).toHaveBeenCalledWith("OnboardingTwo");
    expect(markOnboardingSeen).not.toHaveBeenCalled();
  });

  it("skips straight to Welcome and records the flag", () => {
    render(<Onboarding />);

    fireEvent.press(screen.getByLabelText("Skip onboarding"));

    expect(markOnboardingSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("Welcome");
  });
});

describe("OnboardingTwo", () => {
  it("skips straight to Welcome and records the flag", () => {
    render(<OnboardingTwo />);

    fireEvent.press(screen.getByLabelText("Skip onboarding"));

    expect(markOnboardingSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("Welcome");
  });

  it("advances to the last screen", () => {
    render(<OnboardingTwo />);

    fireEvent.press(screen.getByText("Continue"));

    expect(mockReplace).toHaveBeenCalledWith("OnboardingThree");
    expect(markOnboardingSeen).not.toHaveBeenCalled();
  });
});

describe("OnboardingThree", () => {
  it("records the flag before handing off to sign up", () => {
    render(<OnboardingThree />);

    fireEvent.press(screen.getByText("Create an Account"));

    expect(markOnboardingSeen).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("TOS", { goto: "SignUp" });
  });

  it("records the flag before handing off to log in", () => {
    render(<OnboardingThree />);

    fireEvent.press(screen.getByText("Log In"));

    expect(markOnboardingSeen).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("TOS", { goto: "SignIn" });
  });
});
