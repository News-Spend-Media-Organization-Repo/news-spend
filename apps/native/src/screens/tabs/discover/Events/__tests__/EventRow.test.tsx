import { render, screen } from "@testing-library/react-native";

import { EventRow, type EventRowEvent } from "../EventRow";

jest.mock("#/components/heroui/text", () => ({
  Text: require("react-native").Text,
}));
jest.mock("#/components/heroui/image", () => ({
  Image: () => null,
}));

const event = (overrides: Partial<EventRowEvent> = {}): EventRowEvent => ({
  id: "evt-1",
  title: "Lagos Live",
  description: "A show",
  venue: "Eko Centre",
  city: "Lagos",
  category: "music",
  imageUrl: "https://img.test/1.jpg",
  startsAt: "2026-12-01T19:00:00.000Z",
  endsAt: "2026-12-01T22:00:00.000Z",
  currency: "NGN",
  fromPriceMinor: 500_000,
  free: false,
  onSale: true,
  pointsFrom: 150,
  ...overrides,
});

const VENUE = /Eko Centre/;
const FROM_PRICE = /From ₦/;

describe("EventRow", () => {
  it("renders the title, venue and from-price", async () => {
    await render(<EventRow event={event()} onPress={jest.fn()} />);

    expect(screen.getByText("Lagos Live")).toBeTruthy();
    expect(screen.getByText(VENUE)).toBeTruthy();
    expect(screen.getByText("From ₦5,000")).toBeTruthy();
  });

  it("shows the points pill when the event earns points", async () => {
    await render(
      <EventRow event={event({ pointsFrom: 250 })} onPress={jest.fn()} />
    );

    expect(screen.getByTestId("event-points-pill")).toBeTruthy();
    expect(screen.getByText("250 points")).toBeTruthy();
  });

  it("hides the points pill when the event earns none", async () => {
    await render(
      <EventRow event={event({ pointsFrom: 0 })} onPress={jest.fn()} />
    );

    expect(screen.queryByTestId("event-points-pill")).toBeNull();
  });

  it("shows Free for a free event", async () => {
    await render(
      <EventRow
        event={event({ free: true, fromPriceMinor: null, pointsFrom: 0 })}
        onPress={jest.fn()}
      />
    );

    expect(screen.getByText("Free")).toBeTruthy();
    expect(screen.queryByText(FROM_PRICE)).toBeNull();
  });
});
