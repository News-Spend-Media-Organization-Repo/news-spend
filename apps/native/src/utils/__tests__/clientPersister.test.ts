import { getCacheBuster } from "../clientPersister";
import { QUERY_CACHE_VERSION } from "../queryCacheVersion";

jest.mock("expo-application", () => ({
  nativeApplicationVersion: "9.9.9",
  nativeBuildVersion: "99",
}));
jest.mock("../storage", () => ({ storage: {} }));

describe("getCacheBuster", () => {
  it("combines the app version with the manual cache version", () => {
    const buster = getCacheBuster();

    expect(buster).toContain("9.9.9");
    expect(buster).toContain(QUERY_CACHE_VERSION);
  });
});
