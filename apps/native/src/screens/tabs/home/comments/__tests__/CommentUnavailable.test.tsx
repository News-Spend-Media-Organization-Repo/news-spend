import { fireEvent, render, screen } from "@testing-library/react-native";

import { CommentUnavailable } from "../CommentUnavailable";

describe("CommentUnavailable", () => {
  it("shows the title and message", async () => {
    await render(
      <CommentUnavailable
        message="It may have been removed."
        onBack={jest.fn()}
        title="This comment is no longer available"
      />
    );

    expect(
      screen.getByText("This comment is no longer available")
    ).toBeTruthy();
    expect(screen.getByText("It may have been removed.")).toBeTruthy();
  });

  it("goes back from the arrow", async () => {
    const onBack = jest.fn();
    await render(<CommentUnavailable message="m" onBack={onBack} title="t" />);

    await fireEvent.press(screen.getByLabelText("Go back"));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("runs the action", async () => {
    const onPress = jest.fn();
    await render(
      <CommentUnavailable
        action={{ label: "View the article", onPress }}
        message="m"
        onBack={jest.fn()}
        title="t"
      />
    );

    await fireEvent.press(screen.getByText("View the article"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders no button when there is no action", async () => {
    await render(
      <CommentUnavailable message="m" onBack={jest.fn()} title="t" />
    );

    expect(screen.queryByText("View the article")).toBeNull();
  });
});
