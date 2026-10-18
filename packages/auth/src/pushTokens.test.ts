import { describe, expect, test } from "bun:test";

import { removeSignedOutPushToken } from "./pushTokens";

const fakeDb = () => {
  const calls: unknown[][] = [];
  return {
    calls,
    query: async (text: string, values: unknown[]) => {
      calls.push([text, values]);
    },
  };
};

describe("removeSignedOutPushToken", () => {
  test("deletes the token scoped to the session's user", async () => {
    const db = fakeDb();
    expect(await removeSignedOutPushToken(db, "user-1", "ExpoToken[abc]")).toBe(
      true
    );
    expect(db.calls).toEqual([
      [
        "DELETE FROM push_tokens WHERE token = $1 AND user_id = $2",
        ["ExpoToken[abc]", "user-1"],
      ],
    ]);
  });

  test("does nothing without a session, whatever the body claims", async () => {
    const db = fakeDb();
    expect(
      await removeSignedOutPushToken(db, undefined, "ExpoToken[abc]")
    ).toBe(false);
    expect(db.calls).toEqual([]);
  });

  test("ignores a missing or non-string token", async () => {
    const db = fakeDb();
    expect(await removeSignedOutPushToken(db, "user-1", undefined)).toBe(false);
    expect(await removeSignedOutPushToken(db, "user-1", { $ne: "" })).toBe(
      false
    );
    expect(db.calls).toEqual([]);
  });
});
