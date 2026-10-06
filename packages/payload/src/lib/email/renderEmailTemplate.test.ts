import { describe, expect, test } from "vitest";

import { injectMacros } from "./macros";
import { renderEmailTemplate, toPlainText } from "./renderEmailTemplate";

describe("injectMacros", () => {
  test("replaces {{variable}} placeholders", () => {
    expect(
      injectMacros("Hi {{username}}", { variables: { username: "Ada" } })
    ).toBe("Hi Ada");
  });

  test("leaves unknown placeholders untouched", () => {
    expect(injectMacros("Hi {{username}}", {})).toBe("Hi {{username}}");
  });

  test("resolves @config keys", () => {
    expect(
      injectMacros("{{@config('appName')}}", {
        config: { appName: "NewsSpend" },
      })
    ).toBe("NewsSpend");
  });
});

describe("HTML escaping", () => {
  const evil = '<a href="https://evil.test">Verify</a>';

  test("injectMacros escapes values when escapeHtml is set", () => {
    expect(
      injectMacros("<p>{{name}}</p>", {
        variables: { name: evil },
        escapeHtml: true,
      })
    ).toBe(
      "<p>&lt;a href=&quot;https://evil.test&quot;&gt;Verify&lt;/a&gt;</p>"
    );
  });

  test("injectMacros leaves values raw by default (subjects)", () => {
    expect(injectMacros("{{name}}", { variables: { name: "A & B" } })).toBe(
      "A & B"
    );
  });

  test("renderEmailTemplate never emits an injected tag", async () => {
    const { html, text } = await renderEmailTemplate(
      { html: "<p>Hi {{name}}</p>" },
      { variables: { name: evil } }
    );
    expect(html).not.toContain("<a ");
    expect(text).toBe(`Hi ${evil}`);
  });

  test("apostrophes survive into plain text", async () => {
    const { text } = await renderEmailTemplate(
      { html: "<p>Hi {{name}}</p>" },
      { variables: { name: "O'Neil" } }
    );
    expect(text).toBe("Hi O'Neil");
  });
});

describe("renderEmailTemplate", () => {
  test("injects macros into stored studio HTML", async () => {
    const { html, text } = await renderEmailTemplate(
      { html: "<p>Hi {{username}}</p>" },
      { variables: { username: "Ada" } }
    );

    expect(html).toBe("<p>Hi Ada</p>");
    expect(text).toBe("Hi Ada");
  });

  test("empty html renders empty", async () => {
    const { html, text } = await renderEmailTemplate({});
    expect(html).toBe("");
    expect(text).toBe("");
  });

  test("toPlainText strips tags", () => {
    expect(toPlainText("<p>Hi <b>Ada</b></p>")).toBe("Hi Ada");
  });
});
