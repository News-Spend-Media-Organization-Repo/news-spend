import { fireEvent, render, screen } from "@testing-library/react-native";
import ForYouScreen, { ForYouPreferencesScreen } from "./ForYouScreen";

const mockNavigate = jest.fn();
const mockInvalidate = jest.fn(async () => undefined);
const mockUpdate = jest.fn(async (..._args: unknown[]) => undefined);
const mockGuidance = jest.fn();
const mockGuidanceResult = {
  answer: "These published opportunities relate to your goals.",
  suggestions: [],
  disclaimer:
    "Source-grounded discovery guidance, not an eligibility assessment.",
};
let mockGuest = false;
let mockInterests = ["jobs"];
const mockProfile = () => ({
  interests: mockInterests,
  preferences: {},
  personalized: true,
  consent: true,
  notifications: {
    opportunities: false,
    discovery: false,
    deadlines: false,
    paused: false,
  },
  learned: {},
});
let mockCatalog = [
  { key: "jobs", label: "Jobs", preferences: ["IT & Digital"] },
  { key: "technology", label: "Technology", preferences: ["AI & Data"] },
];
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useIsFocused: () => true,
}));
jest.mock("valtio", () => ({
  useSnapshot: () => ({ user: { id: "reader", isAnonymous: mockGuest } }),
}));
jest.mock("#/state/auth", () => ({ authState: {} }));
jest.mock("#/state/route-state", () => ({ useTabBarHeight: () => 60 }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "event-id" }));
jest.mock("#/lib/orpc", () => ({
  client: {
    forYou: { updateProfile: (...args: unknown[]) => mockUpdate(...args) },
  },
  orpc: {
    forYou: {
      insights: {
        queryOptions: () => ({
          queryKey: ["for-you", "page", "insights"],
        }),
      },
      guidance: { mutationOptions: () => ({}) },
    },
  },
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
  useMutation: () => ({
    isPending: false,
    mutate: (
      input: { goals: string },
      callbacks: {
        onSuccess: (result: typeof mockGuidanceResult) => void;
      }
    ) => {
      mockGuidance(input);
      callbacks.onSuccess(mockGuidanceResult);
    },
  }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const name = queryKey[2];
    const data =
      name === "catalog"
        ? mockCatalog
        : name === "profile"
          ? mockProfile()
          : name === "saves"
            ? []
            : name === "feed"
              ? {
                  items: [],
                  nextOffset: null,
                  personalized: !mockGuest,
                  guest: mockGuest,
                }
              : name === "insights"
                ? {
                    strongest: [{ key: "jobs", label: "Jobs", selected: true }],
                    emerging: [
                      {
                        key: "technology",
                        label: "Technology",
                        reason: "You have engaged with related content.",
                      },
                    ],
                    activityCount: 7,
                    personalizationEnabled: true,
                    trending: [],
                  }
                : undefined;
    return {
      data,
      isSuccess: true,
      isPending: false,
      isError: false,
      error: null,
    };
  },
}));
jest.mock("heroui-native/bottom-sheet", () => {
  const { View } = require("react-native");
  const BottomSheet = ({
    children,
    isOpen,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
  }) => (isOpen ? <View>{children}</View> : null);
  BottomSheet.Portal = ({ children }: { children: React.ReactNode }) => (
    <View>{children}</View>
  );
  BottomSheet.Overlay = () => null;
  BottomSheet.Content = ({ children }: { children: React.ReactNode }) => (
    <View>{children}</View>
  );
  return { BottomSheet };
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
jest.mock("#/components/heroui/button", () => {
  const { Text, Pressable } = require("react-native");
  const Button = ({
    children,
    onPress,
    isDisabled,
  }: {
    children: React.ReactNode;
    onPress: () => void;
    isDisabled: boolean;
  }) => (
    <Pressable disabled={isDisabled} onPress={onPress}>
      {children}
    </Pressable>
  );
  Button.Label = ({ children }: { children: React.ReactNode }) => (
    <Text>{children}</Text>
  );
  return { Button };
});
beforeEach(() => {
  mockGuest = false;
  mockInterests = ["jobs"];
  mockCatalog = [
    { key: "jobs", label: "Jobs", preferences: ["IT & Digital"] },
    { key: "technology", label: "Technology", preferences: ["AI & Data"] },
  ];
  jest.clearAllMocks();
  mockGuidance.mockClear();
});
it("offers guests account creation without full personalization", async () => {
  mockGuest = true;
  await render(<ForYouScreen />);
  expect(screen.getByText("Make For You yours")).toBeTruthy();
  await fireEvent.press(screen.getByText("Create Account"));
  expect(mockNavigate).toHaveBeenCalledWith("SignUp");
});
it("keeps a useful empty state instead of a blank feed", async () => {
  await render(<ForYouScreen />);
  expect(screen.getByText("We're finding more for you")).toBeTruthy();
});
it("shows first-time interest onboarding", async () => {
  mockInterests = [];
  await render(<ForYouScreen />);
  await fireEvent.press(screen.getByText("Choose Interests"));
  expect(screen.getByText("Your Interests")).toBeTruthy();
  expect(screen.getByText("Technology")).toBeTruthy();
});
it("makes optional refinement skippable", async () => {
  mockInterests = [];
  await render(<ForYouScreen />);
  await fireEvent.press(screen.getByText("Choose Interests"));
  await fireEvent.press(screen.getByText("Jobs"));
  await fireEvent.press(screen.getByText("Continue"));
  expect(screen.getByText("Skip Refinement")).toBeTruthy();
});
it("skips refinement entirely when no chosen interest has preferences", async () => {
  mockCatalog = [
    { key: "comedy", label: "Comedy", preferences: [] },
    { key: "ai", label: "AI", preferences: [] },
  ];
  mockInterests = [];
  await render(<ForYouScreen />);
  await fireEvent.press(screen.getByText("Choose Interests"));
  await fireEvent.press(screen.getByText("Comedy"));
  await fireEvent.press(screen.getByText("Continue"));
  expect(screen.queryByText("Skip Refinement")).toBeNull();
  expect(mockUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ interests: ["comedy"], preferences: {} })
  );
  expect(screen.getByText("Your preferences have been saved.")).toBeTruthy();
});
it("shows only interests that have refinements on the refine page", async () => {
  mockCatalog = [
    { key: "jobs", label: "Jobs", preferences: ["IT & Digital"] },
    { key: "comedy", label: "Comedy", preferences: [] },
  ];
  mockInterests = [];
  await render(<ForYouScreen />);
  await fireEvent.press(screen.getByText("Choose Interests"));
  await fireEvent.press(screen.getByText("Jobs"));
  await fireEvent.press(screen.getByText("Comedy"));
  await fireEvent.press(screen.getByText("Continue"));
  expect(screen.getByText("Skip Refinement")).toBeTruthy();
  expect(screen.getByText("Choose up to 3 areas")).toBeTruthy();
  expect(screen.queryByText("What interests you most?")).toBeNull();
  expect(screen.queryByText("Comedy")).toBeNull();
});
it("opens personalization controls from settings", async () => {
  await render(<ForYouPreferencesScreen />);
  expect(screen.getByText("Personalized Recommendations")).toBeTruthy();
  expect(screen.getByText("Consent to learn from my activity")).toBeTruthy();
  await fireEvent.press(screen.getByText("Notification Preferences"));
  expect(screen.getByText("Pause all For You notifications")).toBeTruthy();
});

it("shows insights and sends emerging interests to the existing editor", async () => {
  await render(<ForYouScreen />);
  await fireEvent.press(screen.getByText("Your Insights"));
  expect(await screen.findByText("Emerging interests")).toBeTruthy();
  expect(
    screen.getByText(
      "These are observations, not preference changes. Review and choose explicitly in your interest settings."
    )
  ).toBeTruthy();
  await fireEvent.press(screen.getByText("Review Technology in interests"));
  expect(screen.getByText("Your Interests")).toBeTruthy();
  expect(screen.getByText("Technology")).toBeTruthy();
});

it("submits a goal and explains the source-grounded guidance", async () => {
  await render(<ForYouScreen />);
  await fireEvent.press(screen.getByText("Opportunity Guidance"));
  const goal = "Find a technology internship in Lagos";
  await fireEvent.changeText(
    screen.getByLabelText("Describe your opportunity goal"),
    goal
  );
  await fireEvent.press(screen.getByText("Find Opportunities"));
  expect(mockGuidance).toHaveBeenCalledWith({ goals: goal });
  expect(
    await screen.findByText(
      "These published opportunities relate to your goals."
    )
  ).toBeTruthy();
  expect(
    screen.getByText(
      "Source-grounded discovery guidance, not an eligibility assessment."
    )
  ).toBeTruthy();
});
