import { render, screen } from "@testing-library/react-native";
import GameLauncher from "../GameLauncher";

const mockDispatch = jest.fn();
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockTrack = jest.fn();

let mockUser: { isAnonymous?: boolean } | null = null;
let mockMe: {
  isPending: boolean;
  data?: { dateOfBirth?: string | null } | null;
  refetch: jest.Mock;
} = { isPending: true, refetch: jest.fn() };

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    dispatch: mockDispatch,
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
  StackActions: {
    replace: (name: string, params: unknown) => ({
      type: "REPLACE",
      name,
      params,
    }),
  },
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => mockMe,
}));

jest.mock("#/lib/orpc", () => ({
  orpc: { account: { me: { queryOptions: () => ({}) } } },
}));

jest.mock("valtio", () => ({
  useSnapshot: () => ({ user: mockUser }),
}));
jest.mock("#/state/auth", () => ({ authState: {} }));

jest.mock("#/lib/discoverAnalyticsClient", () => ({
  trackDiscover: (...args: unknown[]) => mockTrack(...args),
}));

jest.mock("#/components", () => ({ ScreenHeader: () => null }));
jest.mock("#/components/dialogs/DateOfBirthDialog", () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) => {
    const { Text } = require("react-native");
    return open ? <Text>dob-dialog</Text> : null;
  },
}));
jest.mock("#/components/heroui/screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => {
    const { View } = require("react-native");
    return <View>{children}</View>;
  },
}));
jest.mock("#/components/heroui/text", () => ({
  Text: ({ children }: { children: React.ReactNode }) => {
    const { Text } = require("react-native");
    return <Text>{children}</Text>;
  },
}));
jest.mock("#/components/heroui/button", () => {
  const { Text, Pressable } = require("react-native");
  const Button = ({
    children,
    onPress,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
  }) => <Pressable onPress={onPress}>{children}</Pressable>;
  Button.Label = ({ children }: { children: React.ReactNode }) => (
    <Text>{children}</Text>
  );
  return { Button };
});

const route = (namespace: string, source?: "all" | "games") =>
  ({ params: { namespace, source } }) as never;

const yearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years - 1);
  return d.toISOString();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { isAnonymous: false };
  mockMe = {
    isPending: false,
    data: { dateOfBirth: yearsAgo(30) },
    refetch: jest.fn(),
  };
});

describe("GameLauncher", () => {
  it("opens an allowed game in the in-app browser, recording where from", async () => {
    await render(<GameLauncher route={route("prism-match-3d", "games")} />);

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0]?.[0]).toMatchObject({
      type: "REPLACE",
      name: "InAppBrowser",
      params: {
        url: "https://play.gamepix.com/prism-match-3d/embed?sid=SW281",
        type: "game",
        hideHeader: true,
        gameNamespace: "prism-match-3d",
      },
    });
    expect(mockTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "game_launch",
        itemId: "prism-match-3d",
        source: "games",
      })
    );
  });

  it("treats a universal link, which names no source, as a link", async () => {
    await render(<GameLauncher route={route("prism-match-3d")} />);
    expect(mockTrack).toHaveBeenCalledWith(
      expect.objectContaining({ event: "game_launch", source: "link" })
    );
  });

  it("turns away a game that is not on the list", async () => {
    await render(<GameLauncher route={route("not-a-game")} />);

    expect(screen.getByText("Game not available")).toBeTruthy();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("sends a guest to sign in and opens nothing", async () => {
    mockUser = { isAnonymous: true };
    await render(<GameLauncher route={route("prism-match-3d")} />);

    expect(mockNavigate).toHaveBeenCalledWith("SignIn", { redirect: true });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("blocks someone under 16 and records why", async () => {
    mockMe = {
      isPending: false,
      data: { dateOfBirth: yearsAgo(12) },
      refetch: jest.fn(),
    };
    await render(<GameLauncher route={route("prism-match-3d")} />);

    expect(screen.getByText("Games are for ages 16 and over")).toBeTruthy();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith(
      expect.objectContaining({ event: "game_blocked", source: "age" })
    );
  });

  it("asks for a date of birth when there is none", async () => {
    mockMe = {
      isPending: false,
      data: { dateOfBirth: null },
      refetch: jest.fn(),
    };
    await render(<GameLauncher route={route("prism-match-3d")} />);

    expect(screen.getByText("dob-dialog")).toBeTruthy();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
