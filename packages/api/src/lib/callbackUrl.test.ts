import { afterEach, describe, expect, it } from "bun:test";

import { signedCallbackUrl } from "./callbackUrl";

const request = (url: string, headers: Record<string, string> = {}) => ({
  url,
  headers: new Headers(headers),
});

afterEach(() => {
  delete process.env.RAILWAY_PUBLIC_DOMAIN;
});

describe("signedCallbackUrl", () => {
  it("removes the hash without reordering or re-encoding the rest", () => {
    expect(
      signedCallbackUrl(request("https://api.example.com/cb?b=2&a=1&hash=x"))
        ?.url
    ).toBe("https://api.example.com/cb?b=2&a=1");
  });

  it("removes the hash first, in the middle, or alone", () => {
    expect(
      signedCallbackUrl(request("https://api.example.com/cb?hash=x&b=2&a=1"))
        ?.url
    ).toBe("https://api.example.com/cb?b=2&a=1");
    expect(
      signedCallbackUrl(request("https://api.example.com/cb?b=2&hash=x&a=1"))
        ?.url
    ).toBe("https://api.example.com/cb?b=2&a=1");
    expect(
      signedCallbackUrl(request("https://api.example.com/cb?hash=x"))?.url
    ).toBe("https://api.example.com/cb");
  });

  it("uses the forwarded host when the proxy gives one", () => {
    expect(
      signedCallbackUrl(
        request("http://internal:8080/cb?a=1", {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "api.example.com",
        })
      )
    ).toMatchObject({
      url: "https://api.example.com/cb?a=1",
      source: "forwarded",
      path: "/cb",
    });
  });

  it("falls back to Railway's public domain", () => {
    process.env.RAILWAY_PUBLIC_DOMAIN = "api.example.com";

    expect(
      signedCallbackUrl(request("http://internal:8080/cb?a=1"))
    ).toMatchObject({
      url: "https://api.example.com/cb?a=1",
      source: "railway",
    });
  });

  it("returns null when there is no request url", () => {
    expect(signedCallbackUrl(undefined)).toBeNull();
  });
});
