import { fireEvent, render, screen } from "@testing-library/react-native";

import { type InboxItem, NotificationRow } from "../NotificationRow";

const item: InboxItem = {
  id: "n1",
  title: "Breaking story",
  body: "Something happened",
  type: "breaking_news",
  createdAt: new Date().toISOString(),
};

describe("NotificationRow", () => {
  it("renders a read row without the unread marker", async () => {
    await render(
      <NotificationRow item={item} onPress={jest.fn()} unread={false} />
    );

    expect(screen.getByText("Breaking story")).toBeTruthy();
    expect(screen.getByText("Something happened")).toBeTruthy();
    expect(screen.queryByLabelText("Unread")).toBeNull();
  });

  it("marks an unread row", async () => {
    await render(<NotificationRow item={item} onPress={jest.fn()} unread />);

    expect(screen.getByLabelText("Unread")).toBeTruthy();
  });

  it("opens the item on press", async () => {
    const onPress = jest.fn();

    await render(
      <NotificationRow item={item} onPress={onPress} unread={false} />
    );
    await fireEvent.press(screen.getByText("Breaking story"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
