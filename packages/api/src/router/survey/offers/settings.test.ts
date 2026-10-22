import { beforeEach, describe, expect, it } from "bun:test";

import { readSurveySettings, resetSurveySettingsCache } from "./settings";

const payloadWith = (doc: unknown) =>
  ({ findGlobal: async () => doc }) as never;

beforeEach(() => resetSurveySettingsCache());

describe("readSurveySettings", () => {
  it("keeps the last good settings after a read failure", async () => {
    expect(
      (
        await readSurveySettings(
          payloadWith({ providers: [{ provider: "rapido", enabled: false }] })
        )
      ).providers.rapido.enabled
    ).toBe(false);

    const failing = {
      findGlobal: async () => {
        throw new Error("down");
      },
    } as never;

    expect((await readSurveySettings(failing)).providers.rapido.enabled).toBe(
      false
    );
  });

  it("falls back to registry defaults before any successful read", async () => {
    const failing = {
      findGlobal: async () => {
        throw new Error("down");
      },
    } as never;

    const settings = await readSurveySettings(failing);

    expect(settings.providers.cpx.enabled).toBe(true);
    expect(settings.providers.bitlabs.enabled).toBe(false);
  });
});
