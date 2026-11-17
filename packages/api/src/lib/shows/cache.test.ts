import { beforeEach, describe, expect, it } from "bun:test";

import { cached, clearShowsCache } from "./cache";

beforeEach(() => {
  clearShowsCache();
});

describe("cached", () => {
  it("serves within the ttl and loads again after it", async () => {
    let clock = 0;
    let loads = 0;
    const load = () => {
      loads += 1;
      return Promise.resolve(`v${loads}`);
    };

    expect(await cached("k", 1000, () => clock, load)).toBe("v1");

    clock = 999;
    expect(await cached("k", 1000, () => clock, load)).toBe("v1");
    expect(loads).toBe(1);

    clock = 1001;
    expect(await cached("k", 1000, () => clock, load)).toBe("v2");
    expect(loads).toBe(2);
  });

  it("keys entries by the full key", async () => {
    let loads = 0;
    const load = () => {
      loads += 1;
      return Promise.resolve(loads);
    };

    await cached("a", 1000, () => 0, load);
    await cached("b", 1000, () => 0, load);

    expect(loads).toBe(2);
  });

  it("shares one load between concurrent callers", async () => {
    let loads = 0;
    let release: (value: string) => void = () => undefined;
    const load = () => {
      loads += 1;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    };

    const first = cached("k", 1000, () => 0, load);
    const second = cached("k", 1000, () => 0, load);
    release("value");

    expect(await Promise.all([first, second])).toEqual(["value", "value"]);
    expect(loads).toBe(1);
  });

  it("does not cache a failed load", async () => {
    let attempts = 0;
    const load = () => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error("boom"))
        : Promise.resolve("ok");
    };

    await expect(cached("k", 1000, () => 0, load)).rejects.toThrow("boom");
    expect(await cached("k", 1000, () => 0, load)).toBe("ok");
    expect(attempts).toBe(2);
  });
});
