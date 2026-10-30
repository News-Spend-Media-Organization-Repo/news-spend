import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { FALLBACK_SHARE_MESSAGE, useShareMessage } from "../share-message";

let mockData: { message?: string } | undefined;

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mockData }),
}));

jest.mock("#/lib/orpc", () => ({
  orpc: {
    appSettings: { getShareMessage: { queryOptions: () => ({}) } },
  },
}));

function Probe() {
  return <Text testID="message">{useShareMessage()}</Text>;
}

const shown = async () => {
  await render(<Probe />);
  return screen.getByTestId("message").props.children as string;
};

describe("useShareMessage", () => {
  afterEach(() => {
    mockData = undefined;
  });

  it("uses the offline fallback until the CMS message arrives", async () => {
    expect(await shown()).toBe(FALLBACK_SHARE_MESSAGE);
  });

  it("uses the message staff wrote once it arrives", async () => {
    mockData = { message: "  Join us: https://link.newsspend.com  " };
    expect(await shown()).toBe("Join us: https://link.newsspend.com");
  });

  it("falls back when the CMS message is blank", async () => {
    mockData = { message: "   " };
    expect(await shown()).toBe(FALLBACK_SHARE_MESSAGE);
  });

  it("carries the owner's wording and the install link", () => {
    expect(FALLBACK_SHARE_MESSAGE).toContain(
      "You can download the App here: https://link.newsspend.com OR search NewsSpend on your device store."
    );
    expect(FALLBACK_SHARE_MESSAGE).not.toContain("{link}");
  });
});
