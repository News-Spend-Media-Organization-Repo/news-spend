import type { PushToken } from "@news-spend-media/payload/types";
import { describe, expect, it } from "vitest";
import { titleFor } from "../expo-push-service";
import type { Notification } from "../../payload-types";

function token(name: unknown): PushToken {
  return { user: { name } } as unknown as PushToken;
}

function notification(title: string): Notification {
  return { title } as Notification;
}

describe("titleFor", () => {
  it("fills in the first name", () => {
    expect(
      titleFor(
        notification("{{firstName}}, a giveaway is live"),
        token("Segun Ade")
      )
    ).toBe("Segun, a giveaway is live");
  });

  it("falls back the same way as the body when there is no name", () => {
    expect(
      titleFor(notification("{{firstName}}, a giveaway is live"), token(null))
    ).toBe("A giveaway is live");
    expect(titleFor(notification("Hey {{firstName}}!"), token(undefined))).toBe(
      "Hey there!"
    );
  });

  it("leaves plain titles untouched", () => {
    expect(
      titleFor(notification("A new giveaway is live 🎁"), token("Ada"))
    ).toBe("A new giveaway is live 🎁");
  });
});
