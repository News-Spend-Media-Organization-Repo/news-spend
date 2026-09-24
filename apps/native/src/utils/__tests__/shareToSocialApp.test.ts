import { Linking, Platform } from "react-native";
import Share from "react-native-share";
import { shareToSocialApp } from "../shareToSocialApp";

jest.mock("react-native-share", () => ({
  __esModule: true,
  default: {
    Social: { FACEBOOK: "facebook", TWITTER: "twitter" },
    isPackageInstalled: jest.fn(),
    shareSingle: jest.fn(),
    open: jest.fn(),
  },
}));

const mockShare = jest.mocked(Share);
const canOpenURL = jest.spyOn(Linking, "canOpenURL");
const openURL = jest.spyOn(Linking, "openURL");

const content = { message: "Headline", url: "https://link.newsspend.com/x" };

function setOS(os: "ios" | "android") {
  jest.replaceProperty(Platform, "OS", os);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  openURL.mockResolvedValue(true);
  mockShare.shareSingle.mockResolvedValue({ success: true, message: "" });
  mockShare.open.mockResolvedValue({ success: true, message: "" });
});

describe("shareToSocialApp on iOS", () => {
  beforeEach(() => setOS("ios"));

  it("opens the X composer with the headline and link when X is installed", async () => {
    canOpenURL.mockResolvedValue(true);
    const onShare = jest.fn();

    await shareToSocialApp("twitter", content, onShare);

    expect(canOpenURL).toHaveBeenCalledWith("twitter://");
    expect(openURL).toHaveBeenCalledWith(
      `twitter://post?message=${encodeURIComponent("Headline https://link.newsspend.com/x")}`
    );
    expect(mockShare.shareSingle).not.toHaveBeenCalled();
    expect(onShare).toHaveBeenCalledWith("twitter");
  });

  it("opens the share sheet for Facebook when it is installed", async () => {
    canOpenURL.mockResolvedValue(true);
    const onShare = jest.fn();

    await shareToSocialApp("facebook", content, onShare);

    expect(mockShare.open).toHaveBeenCalledWith(
      expect.objectContaining(content)
    );
    expect(onShare).toHaveBeenCalledWith("facebook");
  });

  it("sends the reader to the App Store, not the web, when Facebook is missing", async () => {
    canOpenURL.mockResolvedValue(false);
    const onShare = jest.fn();

    await shareToSocialApp("facebook", content, onShare);

    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith(
      "itms-apps://apps.apple.com/app/id284882215"
    );
    expect(mockShare.open).not.toHaveBeenCalled();
    expect(onShare).not.toHaveBeenCalled();
  });

  it("falls back to the App Store web page when the store app can't open", async () => {
    canOpenURL.mockResolvedValue(false);
    openURL.mockRejectedValueOnce(new Error("no handler"));

    await shareToSocialApp("twitter", content);

    expect(openURL).toHaveBeenLastCalledWith(
      "https://apps.apple.com/app/id333903271"
    );
  });

  it("does not count a Facebook share the reader dismissed", async () => {
    canOpenURL.mockResolvedValue(true);
    mockShare.open.mockRejectedValue(new Error("User did not share"));
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    const onShare = jest.fn();

    await shareToSocialApp("facebook", content, onShare);

    expect(onShare).not.toHaveBeenCalled();
  });
});

describe("shareToSocialApp on Android", () => {
  beforeEach(() => setOS("android"));

  it("shares straight into the app when it is installed", async () => {
    mockShare.isPackageInstalled.mockResolvedValue({
      isInstalled: true,
      message: "",
    });
    const onShare = jest.fn();

    await shareToSocialApp("facebook", content, onShare);

    expect(mockShare.isPackageInstalled).toHaveBeenCalledWith(
      "com.facebook.katana"
    );
    expect(mockShare.shareSingle).toHaveBeenCalledWith(
      expect.objectContaining({ ...content, social: "facebook" })
    );
    expect(onShare).toHaveBeenCalledWith("facebook");
  });

  it("opens Play Store for X when it is missing", async () => {
    mockShare.isPackageInstalled.mockResolvedValue({
      isInstalled: false,
      message: "",
    });
    const onShare = jest.fn();

    await shareToSocialApp("twitter", content, onShare);

    expect(openURL).toHaveBeenCalledWith(
      "market://details?id=com.twitter.android"
    );
    expect(mockShare.shareSingle).not.toHaveBeenCalled();
    expect(onShare).not.toHaveBeenCalled();
  });
});
