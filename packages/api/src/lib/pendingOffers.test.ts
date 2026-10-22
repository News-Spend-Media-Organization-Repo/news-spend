import { describe, expect, it } from "bun:test";

import { pendingStateFor } from "./pendingOffers";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-20T12:00:00.000Z");
const ago = (days: number) =>
  new Date(now.getTime() - days * DAY).toISOString();

describe("pendingStateFor", () => {
  it("is pending inside the confirmation window", () => {
    expect(
      pendingStateFor({
        status: "clicked",
        clickedAt: ago(2),
        confirmationDays: 3,
        now,
      })
    ).toBe("pending");
  });

  it("is not_confirmed once the window has passed", () => {
    expect(
      pendingStateFor({
        status: "clicked",
        clickedAt: ago(4),
        confirmationDays: 3,
        now,
      })
    ).toBe("not_confirmed");
  });

  it("counts exactly the deadline as not_confirmed", () => {
    expect(
      pendingStateFor({
        status: "clicked",
        clickedAt: ago(3),
        confirmationDays: 3,
        now,
      })
    ).toBe("not_confirmed");
  });

  it("defaults to 7 days for null, undefined and non-positive windows", () => {
    for (const confirmationDays of [null, undefined, 0, -2]) {
      expect(
        pendingStateFor({
          status: "clicked",
          clickedAt: ago(6),
          confirmationDays,
          now,
        })
      ).toBe("pending");
      expect(
        pendingStateFor({
          status: "clicked",
          clickedAt: ago(8),
          confirmationDays,
          now,
        })
      ).toBe("not_confirmed");
    }
  });

  it("hides a not_confirmed click 14 days after the click", () => {
    expect(
      pendingStateFor({
        status: "clicked",
        clickedAt: ago(13),
        confirmationDays: 3,
        now,
      })
    ).toBe("not_confirmed");
    expect(
      pendingStateFor({
        status: "clicked",
        clickedAt: ago(14),
        confirmationDays: 3,
        now,
      })
    ).toBe("hidden");
  });

  it("shows failed as not_confirmed for 14 days after convertedAt, then hides", () => {
    expect(
      pendingStateFor({
        status: "failed",
        clickedAt: ago(30),
        convertedAt: ago(5),
        confirmationDays: 3,
        now,
      })
    ).toBe("not_confirmed");
    expect(
      pendingStateFor({
        status: "failed",
        clickedAt: ago(30),
        convertedAt: ago(14),
        confirmationDays: 3,
        now,
      })
    ).toBe("hidden");
  });

  it("falls back to clickedAt for failed rows without convertedAt", () => {
    expect(
      pendingStateFor({
        status: "failed",
        clickedAt: ago(2),
        convertedAt: null,
        confirmationDays: 3,
        now,
      })
    ).toBe("not_confirmed");
    expect(
      pendingStateFor({
        status: "failed",
        clickedAt: ago(20),
        confirmationDays: 3,
        now,
      })
    ).toBe("hidden");
  });

  it("hides awarded and converted", () => {
    for (const status of ["awarded", "converted"]) {
      expect(
        pendingStateFor({ status, clickedAt: ago(1), confirmationDays: 3, now })
      ).toBe("hidden");
    }
  });
});
