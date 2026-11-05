import {
  addRecentSearch,
  MAX_RECENT_SEARCHES,
  removeRecentSearch,
} from "../recent-searches";

describe("addRecentSearch", () => {
  it("puts the newest query first", () => {
    expect(addRecentSearch(["old", "older"], "new")).toEqual([
      "new",
      "old",
      "older",
    ]);
  });

  it("de-duplicates case-insensitively and keeps the newest casing", () => {
    expect(addRecentSearch(["Fuel price", "election"], "FUEL PRICE")).toEqual([
      "FUEL PRICE",
      "election",
    ]);
  });

  it("trims the query and ignores blank ones", () => {
    expect(addRecentSearch([], "  fuel  ")).toEqual(["fuel"]);
    expect(addRecentSearch(["fuel"], "   ")).toEqual(["fuel"]);
  });

  it(`caps the list at ${MAX_RECENT_SEARCHES}`, () => {
    const recent = Array.from({ length: 10 }, (_, i) => `query-${i}`);
    const result = addRecentSearch(recent, "newest");

    expect(result).toHaveLength(MAX_RECENT_SEARCHES);
    expect(result[0]).toBe("newest");
  });
});

describe("removeRecentSearch", () => {
  it("removes the matching query case-insensitively", () => {
    expect(removeRecentSearch(["Fuel", "election"], "fuel")).toEqual([
      "election",
    ]);
  });

  it("leaves the list unchanged when nothing matches", () => {
    expect(removeRecentSearch(["Fuel"], "election")).toEqual(["Fuel"]);
  });
});
