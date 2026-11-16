import { render, screen } from "@testing-library/react-native";
import LiveScreen from "./LiveScreen";

let mockLiveData: {
  enabled: boolean;
  title: string;
  description: string;
  streamUrl: string | null;
} | null = null;
let mockLiveError = false;
const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  replaceAsync: jest.fn(async () => undefined),
  status: "readyToPlay",
};

jest.mock("#/lib/orpc", () => ({
  orpc: {
    forYou: {
      live: { queryOptions: () => ({ queryKey: ["for-you", "live"] }) },
    },
  },
}));
jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: mockLiveData,
    isPending: false,
    isError: mockLiveError,
    refetch: jest.fn(),
  }),
}));
jest.mock("expo", () => ({
  useEvent: () => ({ status: "readyToPlay", error: undefined }),
}));
jest.mock("expo-video", () => {
  const { View } = require("react-native");
  return {
    useVideoPlayer: () => mockPlayer,
    VideoView: () => <View testID="live-video" />,
  };
});
jest.mock("#/components/heroui/screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => {
    const { View } = require("react-native");
    return <View>{children}</View>;
  },
}));
jest.mock("#/components/heroui/text", () => ({
  Text: ({ children, ...props }: { children: React.ReactNode }) => {
    const { Text } = require("react-native");
    return <Text {...props}>{children}</Text>;
  },
}));

describe("Live screen", () => {
  beforeEach(() => {
    mockLiveData = {
      enabled: false,
      title: "NewsSpend Live",
      description: "",
      streamUrl: null,
    };
    mockLiveError = false;
    jest.clearAllMocks();
  });

  it("shows a truthful offline state when no broadcast is configured", async () => {
    await render(<LiveScreen />);
    expect(screen.getByText("No broadcast right now")).toBeTruthy();
    expect(screen.queryByTestId("live-video")).toBeNull();
  });

  it("plays only the configured secure stream", async () => {
    mockLiveData = {
      enabled: true,
      title: "Morning briefing",
      description: "Today's live newsroom update.",
      streamUrl: "https://media.newsspend.com/live/stream.m3u8",
    };
    await render(<LiveScreen />);
    expect(screen.getByText("Morning briefing")).toBeTruthy();
    expect(screen.getByTestId("live-video")).toBeTruthy();
  });

  it("does not play an insecure configured URL", async () => {
    mockLiveData = {
      enabled: true,
      title: "Unsafe stream",
      description: "",
      streamUrl: "http://example.test/live.m3u8",
    };
    await render(<LiveScreen />);
    expect(screen.getByText("Stream unavailable")).toBeTruthy();
    expect(screen.queryByTestId("live-video")).toBeNull();
  });
});
