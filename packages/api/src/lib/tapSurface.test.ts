import { afterEach, describe, expect, it } from "bun:test";

import { MISSING_TAP_SURFACE, requireTapSurface } from "./tapSurface";

describe("requireTapSurface", () => {
  const original = process.env.REQUIRE_TAP_SURFACE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.REQUIRE_TAP_SURFACE;
    } else {
      process.env.REQUIRE_TAP_SURFACE = original;
    }
  });

  it("is off when unset", () => {
    delete process.env.REQUIRE_TAP_SURFACE;
    expect(requireTapSurface()).toBe(false);
  });

  it.each(["true", "1", "TRUE ", " True", " 1 "])("is on for %p", (value) => {
    process.env.REQUIRE_TAP_SURFACE = value;
    expect(requireTapSurface()).toBe(true);
  });

  it.each([
    "",
    "  ",
    "false",
    "0",
    "yes",
    "on",
    "garbage",
    "2",
  ])("is off for %p", (value) => {
    process.env.REQUIRE_TAP_SURFACE = value;
    expect(requireTapSurface()).toBe(false);
  });

  it("names the stand-in surface for a tap that sent none", () => {
    expect(MISSING_TAP_SURFACE).toBe("unknown");
  });
});
