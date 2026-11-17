import { describe, expect, it } from "bun:test";

import { buildReturnRedirect } from "./build-return-redirect";

describe("buildReturnRedirect", () => {
  it("sends a purchase reference to the app's order page", () => {
    expect(buildReturnRedirect("abc")).toBe(
      "https://link.newsspend.com/events/order/abc"
    );
  });

  it("encodes reserved characters exactly once", () => {
    expect(buildReturnRedirect("a/b?c&d=e f")).toBe(
      "https://link.newsspend.com/events/order/a%2Fb%3Fc%26d%3De%20f"
    );
  });

  it("falls back to the app root without a purchase", () => {
    expect(buildReturnRedirect(undefined)).toBe("https://link.newsspend.com/");
    expect(buildReturnRedirect(null)).toBe("https://link.newsspend.com/");
    expect(buildReturnRedirect("")).toBe("https://link.newsspend.com/");
  });
});
