import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { fetchBitLabsOffers } from "./index";

const originalFetch = globalThis.fetch;

const respond = (body: unknown, status = 200) => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
};

beforeEach(() => {
  process.env.BITLABS_TOKEN = "token";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.BITLABS_TOKEN;
});

describe("fetchBitLabsOffers", () => {
  it("maps a survey into the unified offer", async () => {
    respond({
      data: {
        surveys: [
          {
            id: "s1",
            click_url: "https://api.bitlabs.ai/v2/client/clicks?i=1",
            value: "172",
            cpi: "1.72",
            cr: 0.42,
            loi: 7,
            country: "NG",
            category: { name: "General" },
          },
        ],
      },
    });

    const offers = await fetchBitLabsOffers(
      "user-1",
      "102.88.108.210",
      "agent",
      "NG",
      10
    );

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      id: "bitlabs-s1",
      provider: "bitlabs",
      points: 172,
      estimatedTime: 7,
      url: "https://api.bitlabs.ai/v2/client/clicks?i=1",
      country: "NG",
      type: "survey",
      qualificationRate: 42,
    });
  });

  it("sends the platform, OS and SDK from the user agent", async () => {
    let called = "";
    globalThis.fetch = ((input: RequestInfo | URL) => {
      called = String(input);
      return Promise.resolve(Response.json({ data: { surveys: [] } }));
    }) as unknown as typeof fetch;

    await fetchBitLabsOffers(
      "user-1",
      "1.2.3.4",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
      "NG",
      10
    );

    expect(called).toContain("os=ANDROID");
    expect(called).toContain("platform=MOBILE");
    expect(called).toContain("sdk=REACT");
  });

  it("sends IOS for an iPhone", async () => {
    let called = "";
    globalThis.fetch = ((input: RequestInfo | URL) => {
      called = String(input);
      return Promise.resolve(Response.json({ data: { surveys: [] } }));
    }) as unknown as typeof fetch;

    await fetchBitLabsOffers(
      "user-1",
      "1.2.3.4",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      "NG",
      10
    );

    expect(called).toContain("os=IOS");
  });

  it("returns an empty list when BitLabs refuses backend access", async () => {
    respond({ error: "forbidden" }, 403);

    expect(
      await fetchBitLabsOffers("user-1", "1.2.3.4", "agent", "NG", 10)
    ).toEqual([]);
  });

  it("returns an empty list for a malformed body", async () => {
    respond({ data: { surveys: "nope" } });

    expect(
      await fetchBitLabsOffers("user-1", "1.2.3.4", "agent", "NG", 10)
    ).toEqual([]);
  });
});
