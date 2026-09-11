import { toInstant } from "../toInstant";

describe("toInstant", () => {
  it("passes through a string that already carries an offset", () => {
    expect(toInstant("2026-09-10T12:00:00.000Z").toISOString()).toBe(
      "2026-09-10T12:00:00.000Z"
    );
    expect(toInstant("2026-09-10T13:00:00+01:00").toISOString()).toBe(
      "2026-09-10T12:00:00.000Z"
    );
    expect(toInstant("2026-09-10T07:00:00-0500").toISOString()).toBe(
      "2026-09-10T12:00:00.000Z"
    );
  });

  it("reads an offset-less string as UTC rather than device-local", () => {
    expect(toInstant("2026-09-10T12:00:00.000").toISOString()).toBe(
      "2026-09-10T12:00:00.000Z"
    );
  });

  it("tolerates surrounding whitespace", () => {
    expect(toInstant("  2026-09-10T12:00:00.000  ").toISOString()).toBe(
      "2026-09-10T12:00:00.000Z"
    );
  });

  it("returns a Date unchanged", () => {
    const d = new Date("2026-09-10T12:00:00.000Z");
    expect(toInstant(d)).toBe(d);
  });
});
