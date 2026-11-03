import { act, render } from "@testing-library/react-native";

const mockTrackImpression = jest.fn();

jest.mock("#/hooks/usePartnerEvents", () => ({
  usePartnerEvents: () => ({ trackImpression: mockTrackImpression }),
}));
jest.mock("#/hooks/usePartnerClick", () => ({
  usePartnerClick: () => ({ handleClick: jest.fn() }),
}));
jest.mock("expo", () => ({ useEventListener: jest.fn() }));
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return { Image: () => <View /> };
});
jest.mock("expo-video", () => {
  const { View } = require("react-native");
  return {
    useVideoPlayer: () => ({
      muted: true,
      pause: jest.fn(),
      play: jest.fn(),
      replaceAsync: jest.fn(() => Promise.resolve()),
    }),
    VideoView: () => <View />,
  };
});
jest.mock("#/components/heroui/button", () => {
  const { Text } = require("react-native");
  const Button = ({ children }: { children?: unknown }) => (
    <Text>{children as never}</Text>
  );
  return { Button };
});
jest.mock("#/components/heroui/icon", () => ({ Icon: () => null }));
jest.mock("#/components/heroui/text", () => {
  const { Text } = require("react-native");
  return { Text };
});
jest.mock("#/lib/icons", () => ({
  PauseIcon: () => null,
  PlayIcon: () => null,
  SpeakerHighIcon: () => null,
  SpeakerSlashIcon: () => null,
}));
jest.mock("#/utils/index", () => ({ getCtaLabel: () => "Go" }));
jest.mock("#/utils/adVideoCache", () => ({
  adVideoUrl: () => null,
  cachedAdVideoUri: () => null,
}));
jest.mock("heroui-native/spinner", () => ({ Spinner: () => null }));
jest.mock("#/components/videoPlayer/thumbnailCache", () => ({
  getThumbnailWithCache: jest.fn(() => Promise.resolve(null)),
}));
jest.mock("#/utils/getImageData", () => ({
  getImageData: () => ({ url: "https://img/x.png", blurhash: undefined }),
}));

import { appOpenAdSheetState } from "#/state/appOpenAdState";
import CustomNewsOpenAd from "../CustomNewsOpenAd";

const ad = { id: "ad-1", type: "banner", title: "An offer" } as never;

describe("CustomNewsOpenAd impression", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockTrackImpression.mockReset();
    appOpenAdSheetState.placement = "news-click-ads";
  });
  afterEach(() => jest.useRealTimers());

  it("records one impression with the sheet's placement after 1000 ms", async () => {
    await render(<CustomNewsOpenAd ad={ad} />);
    await act(async () => {
      jest.advanceTimersByTime(999);
    });
    expect(mockTrackImpression).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockTrackImpression).toHaveBeenCalledTimes(1);
    expect(mockTrackImpression).toHaveBeenCalledWith("ad-1", "news-click-ads");
  });

  it("records nothing when closed at 900 ms", async () => {
    const view = await render(<CustomNewsOpenAd ad={ad} />);
    await act(async () => {
      jest.advanceTimersByTime(900);
    });
    await view.unmount();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockTrackImpression).not.toHaveBeenCalled();
  });

  it("fires once and a re-render neither restarts nor doubles the timer", async () => {
    const view = await render(<CustomNewsOpenAd ad={ad} />);
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await view.rerender(
      <CustomNewsOpenAd ad={{ ...(ad as object) } as never} />
    );
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(mockTrackImpression).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockTrackImpression).toHaveBeenCalledTimes(1);
  });

  it("restarts the timer for a changed ad and records the new ad with the placement at mount", async () => {
    const view = await render(<CustomNewsOpenAd ad={ad} />);
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    appOpenAdSheetState.placement = "banner-news-post";
    await view.rerender(
      <CustomNewsOpenAd ad={{ ...(ad as object), id: "ad-2" } as never} />
    );
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(mockTrackImpression).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(mockTrackImpression).toHaveBeenCalledTimes(1);
    expect(mockTrackImpression).toHaveBeenCalledWith(
      "ad-2",
      "banner-news-post"
    );
  });
});
