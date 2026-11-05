import { isSearchableQuery, normalizeSearchQuery } from "../search-query";

describe("normalizeSearchQuery", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeSearchQuery("  fuel   price  ")).toBe("fuel price");
  });
});

describe("isSearchableQuery", () => {
  it("needs at least two characters after trimming", () => {
    expect(isSearchableQuery("a")).toBe(false);
    expect(isSearchableQuery("  a  ")).toBe(false);
    expect(isSearchableQuery("ab")).toBe(true);
    expect(isSearchableQuery("  ab  ")).toBe(true);
  });
});
