import { fireEvent, render, screen } from "@testing-library/react-native";
import { PendingOfferRow } from "../components/pending-offer-row";

const base = {
  contentId: "c1",
  title: "Install Acme",
  partnerName: "Acme" as string | null,
  expectedWithinDays: 3,
  points: 250,
  clickedAt: "2026-10-18T10:00:00.000Z",
};

describe("PendingOfferRow", () => {
  it("shows the title, a Pending tag and the expected points", async () => {
    await render(
      <PendingOfferRow
        offer={{ ...base, state: "pending" }}
        onPress={jest.fn()}
      />
    );
    expect(screen.getByText("Install Acme")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByText("+250 pts")).toBeTruthy();
  });

  it("tags a lapsed offer as Not confirmed", async () => {
    await render(
      <PendingOfferRow
        offer={{ ...base, state: "not_confirmed" }}
        onPress={jest.fn()}
      />
    );
    expect(screen.getByText("Not confirmed")).toBeTruthy();
  });

  it("hides the points when the server sent none", async () => {
    await render(
      <PendingOfferRow
        offer={{ ...base, points: 0, state: "pending" }}
        onPress={jest.fn()}
      />
    );
    expect(screen.queryByText(/pts/)).toBeNull();
  });

  it("calls onPress with the offer", async () => {
    const onPress = jest.fn();
    const offer = { ...base, state: "pending" as const };
    await render(<PendingOfferRow offer={offer} onPress={onPress} />);
    await fireEvent.press(screen.getByText("Install Acme"));
    expect(onPress).toHaveBeenCalledWith(offer);
  });
});
