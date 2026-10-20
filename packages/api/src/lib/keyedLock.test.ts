import { describe, expect, it } from "bun:test";

import { withKeyedLock } from "./keyedLock";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("withKeyedLock", () => {
  it("runs tasks with the same key one at a time, in order", async () => {
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await sleep(ms);
      log.push(`end ${name}`);
    };

    await Promise.all([
      withKeyedLock("k", task("a", 20)),
      withKeyedLock("k", task("b", 1)),
    ]);

    expect(log).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("lets different keys run side by side", async () => {
    const log: string[] = [];
    const task = (name: string) => async () => {
      log.push(`start ${name}`);
      await sleep(10);
      log.push(`end ${name}`);
    };

    await Promise.all([
      withKeyedLock("one", task("a")),
      withKeyedLock("two", task("b")),
    ]);

    expect(log.slice(0, 2)).toEqual(["start a", "start b"]);
  });

  it("does not let a failed task block the next one, and returns each result", async () => {
    const failing = withKeyedLock("k", () => Promise.reject(new Error("boom")));
    const next = withKeyedLock("k", () => Promise.resolve("ok"));

    await expect(failing).rejects.toThrow("boom");
    expect(await next).toBe("ok");
  });
});
