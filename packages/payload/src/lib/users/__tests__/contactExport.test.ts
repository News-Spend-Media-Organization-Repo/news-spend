import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "../contactExport";

describe("csvCell", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('Ada, "the" first')).toBe('"Ada, ""the"" first"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(
      '"\'=HYPERLINK(""http://x"")"'
    );
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });

  it("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("toCsv", () => {
  it("writes a header and one line per row", () => {
    expect(toCsv([{ name: "Ada", email: "a@x.com" }], ["name", "email"])).toBe(
      "name,email\r\nAda,a@x.com\r\n"
    );
  });
});
