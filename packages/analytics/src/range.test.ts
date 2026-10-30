import { describe, expect, it } from "bun:test";

import {
  eachDay,
  isDateRange,
  percentChange,
  resolveRange,
  resolveWindow,
} from "./range";

const NOW = new Date("2026-09-20T10:00:00Z");

describe("resolveRange", () => {
  it("covers the last N calendar days, ending today", () => {
    const r = resolveRange({ days: 7, now: NOW });
    expect(r.current).toEqual({ from: "2026-09-14", to: "2026-09-20" });
    expect(eachDay(r.current)).toHaveLength(7);
  });

  it("puts the previous period immediately before, the same length", () => {
    const r = resolveRange({ days: 30, now: NOW });
    expect(r.previous.to).toBe("2026-08-21");
    expect(eachDay(r.previous)).toHaveLength(30);
    expect(eachDay(r.previous).at(-1)).toBe("2026-08-21");
  });

  it("uses the date in the requested zone, not in UTC", () => {
    // 23:30 UTC on the 20th is already the 21st in Lagos (UTC+1).
    const lateUtc = new Date("2026-09-20T23:30:00Z");
    expect(resolveRange({ days: 7, now: lateUtc }).current.to).toBe(
      "2026-09-20"
    );
    expect(
      resolveRange({ days: 7, now: lateUtc, timeZone: "Africa/Lagos" }).current
        .to
    ).toBe("2026-09-21");
  });

  it("crosses a month and a year boundary", () => {
    const r = resolveRange({ days: 7, now: new Date("2027-01-03T12:00:00Z") });
    expect(r.current.from).toBe("2026-12-28");
    expect(eachDay(r.current)).toContain("2026-12-31");
    expect(eachDay(r.current)).toContain("2027-01-01");
  });

  it("refuses a period the dashboards do not offer", () => {
    expect(() => resolveRange({ days: 10, now: NOW })).toThrow(RangeError);
    expect(() => resolveRange({ days: 0, now: NOW })).toThrow(RangeError);
  });

  it("refuses a time zone that does not exist", () => {
    expect(() =>
      resolveRange({ days: 7, now: NOW, timeZone: "Mars/Olympus" })
    ).toThrow(RangeError);
  });
});

describe("resolveWindow", () => {
  it("covers both chosen days and counts them inclusively", () => {
    const r = resolveWindow({ from: "2026-10-01", to: "2026-10-20" });

    expect(r.current).toEqual({ from: "2026-10-01", to: "2026-10-20" });
    expect(r.days).toBe(20);
    expect(eachDay(r.current)).toHaveLength(20);
  });

  it("puts the previous period immediately before, the same length", () => {
    const r = resolveWindow({ from: "2026-10-01", to: "2026-10-20" });

    expect(r.previous).toEqual({ from: "2026-09-11", to: "2026-09-30" });
    expect(eachDay(r.previous)).toHaveLength(20);
  });

  it("accepts a single day", () => {
    const r = resolveWindow({ from: "2026-10-20", to: "2026-10-20" });

    expect(r.days).toBe(1);
    expect(r.previous).toEqual({ from: "2026-10-19", to: "2026-10-19" });
  });

  it("refuses a backwards, impossible or overlong window", () => {
    expect(() =>
      resolveWindow({ from: "2026-10-20", to: "2026-10-01" })
    ).toThrow(RangeError);
    expect(() =>
      resolveWindow({ from: "2026-02-30", to: "2026-03-02" })
    ).toThrow(RangeError);
    expect(() =>
      resolveWindow({ from: "2026-10-20", to: "2026-10-20x" })
    ).toThrow(RangeError);
    expect(() =>
      resolveWindow({ from: "2025-01-01", to: "2026-01-02" })
    ).toThrow(RangeError);
  });
});

describe("isDateRange", () => {
  it("says which windows the dashboards accept", () => {
    expect(isDateRange("2026-10-01", "2026-10-20")).toBe(true);
    expect(isDateRange("2026-10-20", "2026-10-20")).toBe(true);
    expect(isDateRange("2026-10-20", "2026-10-01")).toBe(false);
    expect(isDateRange("2026-02-30", "2026-03-02")).toBe(false);
    expect(isDateRange("", "")).toBe(false);
  });

  it("allows exactly the cap and refuses a day more", () => {
    expect(isDateRange("2026-01-01", "2026-12-31")).toBe(true);
    expect(isDateRange("2026-01-01", "2027-01-01")).toBe(false);
  });
});

describe("percentChange", () => {
  it("is the change as a percentage of the earlier figure", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(90, 100)).toBe(-10);
  });

  it("is null when there is nothing to compare against", () => {
    expect(percentChange(5, 0)).toBeNull();
  });
});
