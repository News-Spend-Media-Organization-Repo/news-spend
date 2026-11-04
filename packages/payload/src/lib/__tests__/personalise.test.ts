import { describe, expect, it } from "vitest";
import {
  firstNameOf,
  hasPlaceholder,
  normalisePlaceholders,
  personalise,
  unknownPlaceholders,
  validatePlaceholders,
} from "../personalise";

describe("personalise", () => {
  it("fills in the first name only", () => {
    expect(
      personalise("{{firstName}}, join 1500 winners", "Segun Adeyemi")
    ).toBe("Segun, join 1500 winners");
  });

  it("tolerates spacing and case in the placeholder", () => {
    expect(personalise("Hi {{ FirstName }}!", "Ada")).toBe("Hi Ada!");
  });

  // Operators have typed this in the CMS; one pair of braces must not leak.
  it("accepts a single-brace placeholder", () => {
    expect(personalise("{firstName}, join 1500 winners", "Segun")).toBe(
      "Segun, join 1500 winners"
    );
    expect(personalise("{firstName}, join 1500 winners", null)).toBe(
      "Join 1500 winners"
    );
  });

  it("drops a leading placeholder and capitalises when there is no name", () => {
    expect(personalise("{{firstName}}, join 1500 winners", null)).toBe(
      "Join 1500 winners"
    );
    expect(personalise("{{firstName}}, join 1500 winners", "  ")).toBe(
      "Join 1500 winners"
    );
  });

  it("uses 'there' for a mid-sentence placeholder when there is no name", () => {
    expect(
      personalise("Hey {{firstName}}, a giveaway is live", undefined)
    ).toBe("Hey there, a giveaway is live");
  });

  it("leaves text without a placeholder untouched", () => {
    expect(personalise("A giveaway is live", "Ada")).toBe("A giveaway is live");
  });
});

describe("hasPlaceholder / firstNameOf", () => {
  it("detects the placeholder repeatedly (no stateful regex)", () => {
    expect(hasPlaceholder("{{firstName}}")).toBe(true);
    expect(hasPlaceholder("{{firstName}}")).toBe(true);
    expect(hasPlaceholder("{firstName}")).toBe(true);
    expect(hasPlaceholder("plain")).toBe(false);
  });

  it("takes the first word", () => {
    expect(firstNameOf(" Segun  Adeyemi ")).toBe("Segun");
    expect(firstNameOf("")).toBeNull();
  });
});

describe("placeholder validation", () => {
  it("normalises accepted spellings to the canonical placeholder", () => {
    expect(normalisePlaceholders("{firstName}, hi")).toBe("{{firstName}}, hi");
    expect(normalisePlaceholders("Hi {{ FirstName }}!")).toBe(
      "Hi {{firstName}}!"
    );
    expect(normalisePlaceholders("Hi {{firstName}}!")).toBe(
      "Hi {{firstName}}!"
    );
  });

  it("reports invented placeholders", () => {
    expect(unknownPlaceholders("Hi {firstName}")).toEqual([]);
    expect(unknownPlaceholders("Hi {{firstName}}")).toEqual([]);
    expect(unknownPlaceholders("Hi {nam} and {{first_name}}")).toEqual([
      "{nam}",
      "{{first_name}}",
    ]);
    expect(unknownPlaceholders("100{percent}")).toEqual(["{percent}"]);
  });

  it("rejects a value with an unknown placeholder and names it", () => {
    expect(validatePlaceholders("Hi {{firstName}}")).toBe(true);
    expect(validatePlaceholders("Hi {nam}")).toContain("{nam}");
    expect(validatePlaceholders("Hi {nam}")).toContain("{{firstName}}");
  });
});
