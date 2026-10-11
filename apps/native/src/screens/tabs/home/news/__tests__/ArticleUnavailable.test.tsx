import { fireEvent, render, screen } from "@testing-library/react-native";

import { ArticleUnavailable } from "../ArticleUnavailable";

describe("ArticleUnavailable", () => {
  it("says the article is gone rather than the page", async () => {
    await render(
      <ArticleUnavailable onBack={jest.fn()} onGoToLatest={jest.fn()} />
    );

    expect(
      screen.getByText("This article is no longer available")
    ).toBeTruthy();
    expect(screen.queryByText("Page not found")).toBeNull();
  });

  it("takes the reader to the latest news", async () => {
    const onGoToLatest = jest.fn();
    await render(
      <ArticleUnavailable onBack={jest.fn()} onGoToLatest={onGoToLatest} />
    );

    await fireEvent.press(screen.getByText("See the latest news"));

    expect(onGoToLatest).toHaveBeenCalledTimes(1);
  });

  it("goes back from the arrow", async () => {
    const onBack = jest.fn();
    await render(
      <ArticleUnavailable onBack={onBack} onGoToLatest={jest.fn()} />
    );

    await fireEvent.press(screen.getByLabelText("Go back"));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
