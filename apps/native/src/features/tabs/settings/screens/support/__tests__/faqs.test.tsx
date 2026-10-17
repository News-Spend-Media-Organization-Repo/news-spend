import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { FAQ_FALLBACK } from "../faq/faqFallback";
import FAQs from "../faqs";

type MockQuery = {
  data?: { categories: typeof FAQ_FALLBACK };
  isError: boolean;
  isPending: boolean;
  fetchStatus: "fetching" | "paused" | "idle";
};

let mockQuery: MockQuery;
const mockToastError = jest.fn();

const cms = [
  {
    id: "c1",
    name: "Getting Started",
    icon: "rocket",
    questions: [
      { id: "q1", question: "What is NewsSpend?", answer: "A rewards app." },
      {
        id: "q2",
        question: "How do I claim a prize?",
        answer: "First.\n\nSecond.",
      },
    ],
  },
  {
    id: "c2",
    name: "Giveaways",
    icon: "gift",
    questions: [
      { id: "q3", question: "When are draws held?", answer: "Every 14 days." },
    ],
  },
];

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => mockQuery,
}));

jest.mock("#/lib/orpc", () => ({
  orpc: { faq: { get: { queryOptions: () => ({}) } } },
}));

jest.mock("#/components/heroui/toast", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
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
jest.mock("#/components/heroui/icon", () => ({ Icon: () => null }));
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
// heroui-native's Accordion and Skeleton are not in the shared jest mocks, and
// the resolver sends every unmocked `heroui-native/*` specifier to the same
// fallback file, so one factory has to stand in for both. The Accordion keeps
// its contract: items start closed, a trigger toggles its item, and a closed
// item mounts no content.
jest.mock("heroui-native/accordion", () => {
  const React = require("react");
  const { View, Pressable } = require("react-native");

  const RootContext = React.createContext({
    open: [] as string[],
    toggle: jest.fn(),
  });
  const ItemContext = React.createContext("");

  const Accordion = ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string[];
    onValueChange?: (value: string[]) => void;
  }) => {
    const [inner, setInner] = React.useState([] as string[]);
    const open = value ?? inner;
    const toggle = (item: string) => {
      const next = open.includes(item)
        ? open.filter((v: string) => v !== item)
        : [...open, item];
      setInner(next);
      onValueChange?.(next);
    };
    return (
      <RootContext.Provider value={{ open, toggle }}>
        <View>{children}</View>
      </RootContext.Provider>
    );
  };
  Accordion.Item = ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => (
    <ItemContext.Provider value={value}>
      <View>{children}</View>
    </ItemContext.Provider>
  );
  Accordion.Trigger = ({ children }: { children: React.ReactNode }) => {
    const { toggle } = React.useContext(RootContext);
    const item = React.useContext(ItemContext);
    return <Pressable onPress={() => toggle(item)}>{children}</Pressable>;
  };
  Accordion.Indicator = () => null;
  Accordion.Content = ({ children }: { children: React.ReactNode }) => {
    const { open } = React.useContext(RootContext);
    const item = React.useContext(ItemContext);
    return open.includes(item) ? <View>{children}</View> : null;
  };
  const Skeleton = () => <View testID="faq-skeleton" />;
  return { Accordion, Skeleton };
});

const settled = (): MockQuery => ({
  data: { categories: cms },
  isError: false,
  isPending: false,
  fetchStatus: "idle",
});

let openURL: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = settled();
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});

describe("FAQs screen", () => {
  it('renders the header, subtitle and every category with "N questions"', async () => {
    await render(<FAQs />);

    expect(screen.getByText("Help & FAQs")).toBeTruthy();
    expect(
      screen.getByText("Find answers to common questions about NewsSpend")
    ).toBeTruthy();
    expect(screen.getByText("Getting Started")).toBeTruthy();
    expect(screen.getByText("2 questions")).toBeTruthy();
    expect(screen.getByText("Giveaways")).toBeTruthy();
    expect(screen.getByText("1 question")).toBeTruthy();
    expect(screen.queryByText("What is NewsSpend?")).toBeNull();
  });

  it("opens a category and shows its questions; opening a question shows its answer", async () => {
    await render(<FAQs />);

    await fireEvent.press(screen.getByText("Getting Started"));
    expect(screen.getByText("What is NewsSpend?")).toBeTruthy();
    expect(screen.queryByText("A rewards app.")).toBeNull();

    await fireEvent.press(screen.getByText("What is NewsSpend?"));
    expect(screen.getByText("A rewards app.")).toBeTruthy();
  });

  it("shows the fallback when the query errors", async () => {
    mockQuery = {
      isError: true,
      isPending: false,
      fetchStatus: "idle",
    };
    await render(<FAQs />);

    expect(screen.getByText(FAQ_FALLBACK[0]?.name ?? "")).toBeTruthy();
    expect(screen.queryByTestId("faq-skeleton")).toBeNull();
  });

  it("shows the fallback when categories is empty", async () => {
    mockQuery = { ...settled(), data: { categories: [] } };
    await render(<FAQs />);

    expect(screen.getByText(FAQ_FALLBACK[0]?.name ?? "")).toBeTruthy();
  });

  it('shows the fallback, not the skeleton, when the query is pending and fetchStatus is "paused"', async () => {
    mockQuery = { isError: false, isPending: true, fetchStatus: "paused" };
    await render(<FAQs />);

    expect(screen.getByText(FAQ_FALLBACK[0]?.name ?? "")).toBeTruthy();
    expect(screen.queryByTestId("faq-skeleton")).toBeNull();
  });

  it("shows the skeleton when pending and fetching", async () => {
    mockQuery = { isError: false, isPending: true, fetchStatus: "fetching" };
    await render(<FAQs />);

    expect(screen.getAllByTestId("faq-skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText(FAQ_FALLBACK[0]?.name ?? "")).toBeNull();
  });

  it('narrows to matching questions with "M of N", and shows "No questions match \'zzz\'" plus Contact Support for no match', async () => {
    await render(<FAQs />);
    const search = screen.getByPlaceholderText(
      "Search frequently asked questions..."
    );

    await fireEvent.changeText(search, "claim");
    expect(screen.getByText("1 of 2")).toBeTruthy();
    // Matching categories open on their own while searching.
    expect(screen.getByText("How do I claim a prize?")).toBeTruthy();
    expect(screen.queryByText("What is NewsSpend?")).toBeNull();
    expect(screen.queryByText("Giveaways")).toBeNull();

    await fireEvent.changeText(search, "zzz");
    expect(screen.getByText("No questions match 'zzz'")).toBeTruthy();
    expect(screen.getByText("Contact Support")).toBeTruthy();
  });

  it("Contact Support opens mailto:support@newsspend.com", async () => {
    await render(<FAQs />);

    await fireEvent.press(screen.getByText("Contact Support"));

    expect(screen.getByText("Still need help?")).toBeTruthy();
    expect(
      screen.getByText("Can't find the answer you're looking for?")
    ).toBeTruthy();
    expect(openURL).toHaveBeenCalledWith("mailto:support@newsspend.com");
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("Contact Support shows the toast when openURL rejects", async () => {
    openURL.mockRejectedValue(new Error("no mail app"));
    await render(<FAQs />);

    await fireEvent.press(screen.getByText("Contact Support"));

    expect(mockToastError).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        description: "Email us at support@newsspend.com",
      })
    );
  });

  it('an answer "First.\\n\\nSecond." renders as two paragraphs', async () => {
    await render(<FAQs />);

    await fireEvent.press(screen.getByText("Getting Started"));
    await fireEvent.press(screen.getByText("How do I claim a prize?"));

    expect(screen.getByText("First.")).toBeTruthy();
    expect(screen.getByText("Second.")).toBeTruthy();
  });
});
