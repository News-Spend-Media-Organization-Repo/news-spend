import { describe, expect, test } from "vitest";

import {
  findUnknownVariables,
  resolveUserVariables,
  sampleVariables,
} from "./templateVariables";

describe("findUnknownVariables", () => {
  test("passes registered variables", () => {
    expect(
      findUnknownVariables(["Hi {{username}}, {{email}}", "{{name}}"])
    ).toEqual([]);
  });

  test("flags invented variables", () => {
    expect(findUnknownVariables(["Hi {{firstName}}"])).toEqual(["firstName"]);
  });
});

describe("sampleVariables", () => {
  test("covers every registry key", () => {
    const samples = sampleVariables();
    expect(samples.username).toBe("ada_01");
    expect(samples.name).toBe("Ada");
    expect(samples.email).toBe("ada@example.com");
  });
});

describe("resolveUserVariables", () => {
  test("falls back to name for username", () => {
    expect(resolveUserVariables({ email: "a@b.c", name: "Ada" }).username).toBe(
      "Ada"
    );
  });
});
