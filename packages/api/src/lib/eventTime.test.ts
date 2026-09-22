import { describe, expect, it } from "bun:test";

import {
  clampEventTime,
  MAX_EVENT_AGE_MS,
  MAX_EVENT_SKEW_MS,
} from "./eventTime";

const RECEIVED = new Date("2026-09-20T12:00:00.000Z");

describe("clampEventTime", () => {
  it("keeps a device time inside the window", () => {
    const claimed = "2026-09-20T11:30:00.000Z";
    expect(clampEventTime(claimed, RECEIVED).toISOString()).toBe(claimed);
  });

  it("uses the arrival time when none is supplied", () => {
    expect(clampEventTime(undefined, RECEIVED)).toEqual(RECEIVED);
  });

  it("uses the arrival time when the value is not a date", () => {
    expect(clampEventTime("yesterday", RECEIVED)).toEqual(RECEIVED);
    expect(clampEventTime("", RECEIVED)).toEqual(RECEIVED);
  });

  it("allows a little clock drift into the future", () => {
    const claimed = new Date(RECEIVED.getTime() + 60_000).toISOString();
    expect(clampEventTime(claimed, RECEIVED).toISOString()).toBe(claimed);
  });

  it("holds a future time to the skew allowance", () => {
    const result = clampEventTime("2099-01-01T00:00:00.000Z", RECEIVED);
    expect(result.getTime()).toBe(RECEIVED.getTime() + MAX_EVENT_SKEW_MS);
  });

  it("allows a queue that sat offline for days", () => {
    const claimed = new Date(
      RECEIVED.getTime() - 3 * 24 * 60 * 60 * 1000
    ).toISOString();
    expect(clampEventTime(claimed, RECEIVED).toISOString()).toBe(claimed);
  });

  it("holds an old time to the age window", () => {
    const result = clampEventTime("2020-01-01T00:00:00.000Z", RECEIVED);
    expect(result.getTime()).toBe(RECEIVED.getTime() - MAX_EVENT_AGE_MS);
  });
});
