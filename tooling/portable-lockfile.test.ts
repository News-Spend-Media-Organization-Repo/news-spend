import { describe, expect, it } from "bun:test";
import { portableLockfile } from "./portable-lockfile.mjs";

describe("portable lockfile addresses", () => {
  it("rewrites public mirror URLs without changing versions or integrity", () => {
    const original =
      '["example@1.2.3","http://package-firewall.replit.internal/npm/example/-/example-1.2.3.tgz",{},"sha512-unchanged"]';
    expect(portableLockfile(original)).toBe(
      '["example@1.2.3","https://registry.npmjs.org/example/-/example-1.2.3.tgz",{},"sha512-unchanged"]'
    );
  });
  it("preserves scoped package paths", () => {
    expect(
      portableLockfile(
        "https://package-firewall.replit.internal/npm/@scope/name/-/name-1.tgz"
      )
    ).toBe("https://registry.npmjs.org/@scope/name/-/name-1.tgz");
  });
  it("does not change unrelated private registries", () => {
    expect(portableLockfile("https://packages.example.org/private.tgz")).toBe(
      "https://packages.example.org/private.tgz"
    );
  });
  it("is idempotent", () => {
    const once = portableLockfile(
      "http://package-firewall.replit.internal/npm/package.tgz"
    );
    expect(portableLockfile(once)).toBe(once);
  });
});
