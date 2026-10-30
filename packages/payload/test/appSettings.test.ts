import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { Access } from "payload";
import { hasInternalsRole } from "../src/access/adminRoles";
import AppSettings from "../src/globals/AppSettings";
import {
  DEFAULT_SHARE_MESSAGE,
  resolveShareMessage,
  SHARE_LINK_TOKEN,
  SHARE_URL,
} from "../src/lib/appSettings";

describe("resolveShareMessage", () => {
  test("uses the default when nothing has been saved", () => {
    const expected = DEFAULT_SHARE_MESSAGE.replace(SHARE_LINK_TOKEN, SHARE_URL);

    expect(resolveShareMessage(null)).toBe(expected);
    expect(resolveShareMessage(undefined)).toBe(expected);
    expect(resolveShareMessage({})).toBe(expected);
    expect(resolveShareMessage({ shareMessage: null })).toBe(expected);
    expect(resolveShareMessage({ shareMessage: "   \n " })).toBe(expected);
  });

  test("puts the link where staff wrote the token", () => {
    expect(
      resolveShareMessage({ shareMessage: `Join us! ${SHARE_LINK_TOKEN} Bye.` })
    ).toBe(`Join us! ${SHARE_URL} Bye.`);
  });

  test("fills every occurrence of the token", () => {
    expect(
      resolveShareMessage({
        shareMessage: `${SHARE_LINK_TOKEN} or ${SHARE_LINK_TOKEN}`,
      })
    ).toBe(`${SHARE_URL} or ${SHARE_URL}`);
  });

  test("adds the link to the end when the token was left out", () => {
    expect(resolveShareMessage({ shareMessage: "  Join us!  " })).toBe(
      `Join us! ${SHARE_URL}`
    );
  });

  test("the default carries the owner's wording and the link token", () => {
    expect(DEFAULT_SHARE_MESSAGE).toContain("You can download the App here:");
    expect(DEFAULT_SHARE_MESSAGE).toContain(
      "OR search NewsSpend on your device store."
    );
    expect(DEFAULT_SHARE_MESSAGE).toContain(SHARE_LINK_TOKEN);
    expect(SHARE_URL).toBe("https://link.newsspend.com");
  });

  test("the app's offline fallback is the default with the link filled in", () => {
    const source = readFileSync(
      new URL(
        "../../../apps/native/src/features/tabs/settings/screens/share-message.ts",
        import.meta.url
      ),
      "utf8"
    );
    const filled = DEFAULT_SHARE_MESSAGE.replace(SHARE_LINK_TOKEN, SHARE_URL);

    expect(source).toContain(JSON.stringify(filled));
  });
});

describe("the App Settings global", () => {
  const admin = (role: string) => ({ collection: "admins", role });
  const can = (access: Access | undefined, user: unknown) =>
    access?.({ req: { user } } as never);

  test("is readable by staff and changeable only by trusted roles", () => {
    expect(AppSettings.access?.update).toBe(hasInternalsRole);
    for (const role of ["super-admin", "content-manager", "editor", "viewer"]) {
      expect(can(AppSettings.access?.read, admin(role))).toBe(true);
    }
    expect(can(AppSettings.access?.read, admin("partner"))).toBe(false);
    expect(can(AppSettings.access?.read, null)).toBe(false);

    expect(can(AppSettings.access?.update, admin("super-admin"))).toBe(true);
    expect(can(AppSettings.access?.update, admin("content-manager"))).toBe(
      true
    );
    for (const role of ["editor", "viewer", "partner"]) {
      expect(can(AppSettings.access?.update, admin(role))).toBe(false);
    }
  });

  test("pre-fills the box with the default message", () => {
    const field = AppSettings.fields.find(
      (f) => "name" in f && f.name === "shareMessage"
    );

    expect(field).toMatchObject({
      type: "textarea",
      defaultValue: DEFAULT_SHARE_MESSAGE,
      maxLength: 800,
    });
  });
});
