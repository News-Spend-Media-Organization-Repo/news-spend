import { getCacheBuster } from "../clientPersister";
import { QUERY_CACHE_VERSION } from "../queryCacheVersion";

let mockUpdateId: string | null = null;

jest.mock("expo-application", () => ({
  nativeApplicationVersion: "9.9.9",
  nativeBuildVersion: "99",
}));
jest.mock("expo-updates", () => ({
  get updateId() {
    return mockUpdateId;
  },
}));
jest.mock("../storage", () => ({ storage: {} }));

describe("getCacheBuster", () => {
  afterEach(() => {
    mockUpdateId = null;
  });

  it("combines the app version with the manual cache version on an embedded bundle", () => {
    const buster = getCacheBuster();

    expect(buster).toContain("9.9.9");
    expect(buster).toContain(QUERY_CACHE_VERSION);
  });

  it("uses the running OTA's update id instead of the manual version", () => {
    mockUpdateId = "ota-123";

    expect(getCacheBuster()).toBe("9.9.9:ota-123");
  });
});
