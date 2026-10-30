import { beforeEach, describe, expect, it } from "bun:test";
import {
  DEFAULT_SHARE_MESSAGE,
  SHARE_LINK_TOKEN,
  SHARE_URL,
} from "@news-spend-media/payload/lib/appSettings";
import { call } from "@orpc/server";

import { createFakePayload, mockContext } from "../test-utils";
import { appSettingsRouter, resetShareMessageCache } from "./appSettings";

const DEFAULT = DEFAULT_SHARE_MESSAGE.replace(SHARE_LINK_TOKEN, SHARE_URL);

function run(globals: Record<string, Record<string, unknown> | null>) {
  const payload = createFakePayload({ globals });
  return call(appSettingsRouter.getShareMessage, undefined, {
    context: mockContext({ payload }),
  });
}

describe("appSettings.getShareMessage", () => {
  beforeEach(() => resetShareMessageCache());

  it("serves the default before anyone has saved the global", async () => {
    expect(await run({})).toEqual({ message: DEFAULT });
  });

  it("serves the message staff wrote, with the link filled in", async () => {
    const result = await run({
      "app-settings": { shareMessage: `Get it here: ${SHARE_LINK_TOKEN}` },
    });

    expect(result).toEqual({ message: `Get it here: ${SHARE_URL}` });
  });

  it("appends the link when staff left the token out", async () => {
    const result = await run({ "app-settings": { shareMessage: "Join us" } });

    expect(result.message).toBe(`Join us ${SHARE_URL}`);
  });

  it("needs no signed-in user", async () => {
    const payload = createFakePayload({ globals: {} });
    const result = await call(appSettingsRouter.getShareMessage, undefined, {
      context: mockContext({ payload, user: null as never }),
    });

    expect(result.message).toBe(DEFAULT);
  });

  it("keeps the last good message when a read fails", async () => {
    await run({
      "app-settings": { shareMessage: `Custom ${SHARE_LINK_TOKEN}` },
    });

    const payload = createFakePayload({ globals: {} });
    payload.findGlobal = () => Promise.reject(new Error("db down"));
    const result = await call(appSettingsRouter.getShareMessage, undefined, {
      context: mockContext({ payload }),
    });

    expect(result.message).toBe(`Custom ${SHARE_URL}`);
  });

  it("falls back to the default when a read fails and nothing was cached", async () => {
    const payload = createFakePayload({ globals: {} });
    payload.findGlobal = () => Promise.reject(new Error("db down"));
    const result = await call(appSettingsRouter.getShareMessage, undefined, {
      context: mockContext({ payload }),
    });

    expect(result.message).toBe(DEFAULT);
  });
});
