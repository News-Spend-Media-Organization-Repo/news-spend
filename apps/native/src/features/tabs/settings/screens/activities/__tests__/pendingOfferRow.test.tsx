import { render, screen } from "@testing-library/react-native";
import { PendingOfferRow } from "../components/pending-offer-row";

const base = {
  contentId: "c1",
  title: "Install Acme",
  partnerName: "Acme" as string | null,
  expectedWithinDays: 3,
  clickedAt: "2026-10-18T10:00:00.000Z",
};

const POINTS_TEXT = /\d+ pts/;

describe("PendingOfferRow", () => {
  it("renders a pending offer with the partner name", async () => {
    await render(<PendingOfferRow offer={{ ...base, state: "pending" }} />);
    expect(screen.getByText("Install Acme")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(
      screen.getByText("Waiting for Acme to confirm. Usually within 3 days.")
    ).toBeTruthy();
  });

  it("falls back to 'the partner' and uses singular day", async () => {
    await render(
      <PendingOfferRow
        offer={{
          ...base,
          partnerName: null,
          expectedWithinDays: 1,
          state: "pending",
        }}
      />
    );
    expect(
      screen.getByText(
        "Waiting for the partner to confirm. Usually within 1 day."
      )
    ).toBeTruthy();
  });

  it("renders a not-confirmed offer with no points text", async () => {
    await render(
      <PendingOfferRow offer={{ ...base, state: "not_confirmed" }} />
    );
    expect(screen.getByText("Not confirmed")).toBeTruthy();
    expect(
      screen.getByText("Contact support if you completed it.")
    ).toBeTruthy();
    expect(screen.queryByText(POINTS_TEXT)).toBeNull();
  });
});
