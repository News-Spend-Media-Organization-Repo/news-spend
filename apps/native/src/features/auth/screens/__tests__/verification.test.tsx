import { fireEvent, render, screen } from "@testing-library/react-native";
import { OTP_LENGTH } from "#/lib/otp";
import Verification from "../verification";

const mockVerify = jest.fn();
const mockSend = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useIsFocused: jest.fn(() => true),
  useNavigation: jest.fn(() => ({ goBack: jest.fn(), navigate: jest.fn() })),
  useRoute: jest.fn(() => ({
    params: { email: "reader@example.com", otpSent: true },
  })),
}));

jest.mock("../../hooks/useOTP", () => ({
  useVerifyOTP: () => ({ mutate: mockVerify, isPending: false }),
  useSendOtp: () => ({ mutate: mockSend, isPending: false }),
}));

describe("Verification screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("draws one box per digit of the code it asks the server for", async () => {
    await render(<Verification />);

    expect(OTP_LENGTH).toBe(6);
    expect(screen.getAllByTestId(/^otp-slot-/)).toHaveLength(OTP_LENGTH);
  });

  it("won't submit a four-digit code", async () => {
    await render(<Verification />);

    await fireEvent.changeText(screen.getByTestId("otp-input"), "1234");
    await fireEvent.press(screen.getByText("Submit"));

    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("submits the full six-digit code", async () => {
    await render(<Verification />);

    await fireEvent.changeText(screen.getByTestId("otp-input"), "123456");
    await fireEvent.press(screen.getByText("Submit"));

    expect(mockVerify).toHaveBeenCalledWith(
      { otp: "123456", email: "reader@example.com" },
      expect.anything()
    );
  });
});
