import { resolveBuildEnvironment } from "../buildEnvironment";

describe("resolveBuildEnvironment", () => {
  it.each([
    ["production", undefined, "production"],
    ["preview", undefined, "staging"],
    ["beta", undefined, "staging"],
    ["development", undefined, "development"],
  ])("takes the %s channel to be %s", (channel, variant, expected) => {
    expect(resolveBuildEnvironment(channel, variant)).toBe(expected);
  });

  it("trusts the channel over a variant an update baked in from another machine", () => {
    // A production build, updated from a laptop whose .env says development.
    expect(resolveBuildEnvironment("production", "development")).toBe(
      "production"
    );
    // A preview build, updated from a shell with no APP_VARIANT at all.
    expect(resolveBuildEnvironment("preview", undefined)).toBe("staging");
  });

  it("falls back to the variant where there is no channel (Expo Go, a local dev client)", () => {
    expect(resolveBuildEnvironment(null, "development")).toBe("development");
    expect(resolveBuildEnvironment(undefined, "preview")).toBe("staging");
  });

  it("says unknown rather than guessing", () => {
    expect(resolveBuildEnvironment(null, undefined)).toBe("unknown");
    expect(resolveBuildEnvironment("something-else", "production")).toBe(
      "unknown"
    );
  });
});
