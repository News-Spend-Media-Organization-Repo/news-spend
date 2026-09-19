import { Alert, Linking } from "react-native";
import { ensureCameraPermission } from "../ensureCameraPermission";

const mockGet = jest.fn();
const mockRequest = jest.fn();
const mockAlert = jest.spyOn(Alert, "alert");
const mockOpenSettings = jest.spyOn(Linking, "openSettings");

jest.mock("expo-image-picker", () => ({
  getCameraPermissionsAsync: (...args: unknown[]) => mockGet(...args),
  requestCameraPermissionsAsync: (...args: unknown[]) => mockRequest(...args),
}));

beforeEach(() => {
  mockGet.mockReset();
  mockRequest.mockReset();
  mockAlert.mockReset().mockImplementation(() => undefined);
  mockOpenSettings.mockReset().mockResolvedValue(undefined);
});

describe("ensureCameraPermission", () => {
  it("lets the camera open when access was already granted, without prompting", async () => {
    mockGet.mockResolvedValue({ granted: true, canAskAgain: true });

    await expect(ensureCameraPermission()).resolves.toBe(true);

    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it("asks the first time, and opens the camera if the reader agrees", async () => {
    mockGet.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequest.mockResolvedValue({ granted: true, canAskAgain: true });

    await expect(ensureCameraPermission()).resolves.toBe(true);

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("leaves a reader alone who just said no to the prompt", async () => {
    mockGet.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequest.mockResolvedValue({ granted: false, canAskAgain: false });

    await expect(ensureCameraPermission()).resolves.toBe(false);

    expect(mockAlert).not.toHaveBeenCalled();
  });

  it("sends a reader who refused earlier to Settings, since iOS will not ask again", async () => {
    mockGet.mockResolvedValue({ granted: false, canAskAgain: false });

    await expect(ensureCameraPermission()).resolves.toBe(false);

    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledTimes(1);

    const buttons = mockAlert.mock.calls[0]?.[2] as {
      text: string;
      onPress?: () => void;
    }[];
    buttons.find((b) => b.text === "Open Settings")?.onPress?.();
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });
});
