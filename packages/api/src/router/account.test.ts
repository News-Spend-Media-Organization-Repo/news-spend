import { beforeEach, describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";

import { createFakePayload, expectError, mockContext } from "../test-utils";
import { accountRouter } from "./account";

// Module mock for @news-spend-media/auth — updateProfile calls auth.api.updateUser
const updateUserMock = mock(
  (args: Record<string, Record<string, unknown>>) => ({
    id: "user-1",
    username: args.body?.username as string,
  })
);

mock.module("@news-spend-media/auth", () => ({
  auth: { api: { updateUser: updateUserMock } },
}));

const authedUser = { id: "user-1", isAnonymous: false, username: "tester" };
const guestUser = { id: "guest-1", isAnonymous: true, username: "guest" };

beforeEach(() => {
  updateUserMock.mockClear();
});

// ---------------------------------------------------------------------------
// changePassword
// ---------------------------------------------------------------------------
describe("accountRouter.changePassword", () => {
  it("rejects an unauthenticated caller", async () => {
    const error = await expectError(
      call(
        accountRouter.changePassword,
        { oldPassword: "oldpass", newPassword: "newpass" },
        { context: mockContext() }
      )
    );

    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a guest caller", async () => {
    const error = await expectError(
      call(
        accountRouter.changePassword,
        { oldPassword: "oldpass", newPassword: "newpass" },
        { context: mockContext({ user: guestUser as never }) }
      )
    );

    expect(error).toMatchObject({
      code: "FORBIDDEN",
      message: "Guest users cannot perform this action",
    });
  });

  it("throws NOT_FOUND when the user does not exist", async () => {
    const payload = createFakePayload({ collections: { users: [] } });
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(
        accountRouter.changePassword,
        { oldPassword: "oldpass", newPassword: "newpass" },
        { context: ctx }
      )
    );

    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "User not found",
    });
  });

  it("returns success when the user exists", async () => {
    const payload = createFakePayload({
      collections: { users: [{ id: "user-1" }] },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      accountRouter.changePassword,
      { oldPassword: "oldpass", newPassword: "newpass" },
      { context: ctx }
    );

    expect(result).toEqual({
      success: true,
      message: "Password changed successfully",
    });
  });
});

// ---------------------------------------------------------------------------
// updateProfile
// ---------------------------------------------------------------------------
describe("accountRouter.updateProfile", () => {
  it("rejects an unauthenticated caller", async () => {
    const error = await expectError(
      call(
        accountRouter.updateProfile,
        { username: "newname" },
        { context: mockContext() }
      )
    );

    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a guest caller", async () => {
    const error = await expectError(
      call(
        accountRouter.updateProfile,
        { username: "newname" },
        { context: mockContext({ user: guestUser as never }) }
      )
    );

    expect(error).toMatchObject({
      code: "FORBIDDEN",
      message: "Guest users cannot perform this action",
    });
  });

  it("throws NOT_FOUND when the user does not exist", async () => {
    const payload = createFakePayload({ collections: { users: [] } });
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(
        accountRouter.updateProfile,
        { username: "newname" },
        { context: ctx }
      )
    );

    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "User not found",
    });
  });

  it("rejects a duplicate username with INPUT_VALIDATION_FAILED", async () => {
    const payload = createFakePayload({
      collections: {
        users: [
          { id: "user-1", username: "tester" },
          { id: "user-2", username: "taken" },
        ],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(accountRouter.updateProfile, { username: "taken" }, { context: ctx })
    );

    expect(error).toMatchObject({
      code: "INPUT_VALIDATION_FAILED",
      message: "Invalid input",
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("excludes username from the update body when unchanged (case-insensitive)", async () => {
    const payload = createFakePayload({
      collections: { users: [{ id: "user-1", username: "Tester" }] },
    });
    const ctx = mockContext({
      user: authedUser as never,
      payload,
      headers: new Headers(),
    });

    await call(
      accountRouter.updateProfile,
      { username: "  tester  ", name: "New Name" },
      { context: ctx }
    );

    expect(updateUserMock).toHaveBeenCalledTimes(1);
    const callArgs = updateUserMock.mock.calls[0] as unknown as [
      Record<string, Record<string, unknown>>,
    ];
    // username is NOT included because "Tester".toLowerCase().trim() === "tester"
    expect(callArgs[0].body).not.toHaveProperty("username");
    expect(callArgs[0].body).toMatchObject({ name: "New Name" });
  });

  it("includes username in the update body when changed", async () => {
    const payload = createFakePayload({
      collections: { users: [{ id: "user-1", username: "oldname" }] },
    });
    const ctx = mockContext({
      user: authedUser as never,
      payload,
      headers: new Headers(),
    });

    await call(
      accountRouter.updateProfile,
      { username: "brandnew" },
      { context: ctx }
    );

    const callArgs = updateUserMock.mock.calls[0] as unknown as [
      Record<string, Record<string, unknown>>,
    ];
    expect(callArgs[0].body).toMatchObject({ username: "brandnew" });
  });
});

// ---------------------------------------------------------------------------
// createPushToken
// ---------------------------------------------------------------------------
describe("accountRouter.createPushToken", () => {
  it("rejects an unauthenticated caller", async () => {
    const error = await expectError(
      call(
        accountRouter.createPushToken,
        { token: "tok-1", deviceType: "ios" },
        { context: mockContext() }
      )
    );

    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("allows a guest caller", async () => {
    const payload = createFakePayload({ collections: { "push-tokens": [] } });
    const ctx = mockContext({ user: guestUser as never, payload });

    const result = await call(
      accountRouter.createPushToken,
      { token: "tok-1", deviceType: "android" },
      { context: ctx }
    );

    expect(payload.docs("push-tokens")).toHaveLength(1);
    expect(result).toMatchObject({
      token: "tok-1",
      deviceType: "android",
      status: "active",
    });
  });

  it("creates a new push token when none exists", async () => {
    const payload = createFakePayload({ collections: { "push-tokens": [] } });
    const ctx = mockContext({ user: authedUser as never, payload });

    await call(
      accountRouter.createPushToken,
      {
        token: "tok-new",
        deviceType: "ios",
        deviceModel: "iPhone 15",
        deviceName: "My Phone",
      },
      { context: ctx }
    );

    expect(payload.docs("push-tokens")).toHaveLength(1);
    expect(payload.docs("push-tokens")[0]).toMatchObject({
      token: "tok-new",
      user: "user-1",
      deviceType: "ios",
      status: "active",
      deviceModel: "iPhone 15",
      deviceName: "My Phone",
    });
    // create was called, not update
    expect(
      payload.calls.some(
        (c) => c.op === "create" && c.collection === "push-tokens"
      )
    ).toBe(true);
    expect(
      payload.calls.some(
        (c) => c.op === "update" && c.collection === "push-tokens"
      )
    ).toBe(false);
  });

  it("updates an existing push token when one matches", async () => {
    const payload = createFakePayload({
      collections: {
        "push-tokens": [
          {
            id: "pt-1",
            token: "tok-existing",
            user: "user-1",
            deviceType: "android",
            status: "active",
          },
        ],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    await call(
      accountRouter.createPushToken,
      { token: "tok-existing", deviceType: "web" },
      { context: ctx }
    );

    expect(payload.docs("push-tokens")).toHaveLength(1);
    expect(payload.docs("push-tokens")[0]).toMatchObject({
      deviceType: "web",
      status: "active",
    });
    // update was called, not create
    expect(
      payload.calls.some(
        (c) => c.op === "update" && c.collection === "push-tokens"
      )
    ).toBe(true);
    expect(
      payload.calls.filter(
        (c) => c.op === "create" && c.collection === "push-tokens"
      )
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deletePushToken
// ---------------------------------------------------------------------------
describe("accountRouter.deletePushToken", () => {
  it("rejects an unauthenticated caller", async () => {
    const error = await expectError(
      call(
        accountRouter.deletePushToken,
        { token: "tok-1" },
        { context: mockContext() }
      )
    );

    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("deletes the push token and returns success", async () => {
    const payload = createFakePayload({
      collections: {
        "push-tokens": [
          { id: "pt-1", token: "tok-del", user: "user-1", deviceType: "ios" },
        ],
      },
    });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(
      accountRouter.deletePushToken,
      { token: "tok-del" },
      { context: ctx }
    );

    expect(result).toEqual({ success: true, message: "Push token deleted" });
    expect(
      payload.calls.some(
        (c) => c.op === "delete" && c.collection === "push-tokens"
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// me
// ---------------------------------------------------------------------------
describe("accountRouter.me", () => {
  it("rejects an unauthenticated caller", async () => {
    const error = await expectError(
      call(accountRouter.me, undefined, { context: mockContext() })
    );

    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("throws NOT_FOUND when the user does not exist", async () => {
    const payload = createFakePayload({ collections: { users: [] } });
    const ctx = mockContext({ user: authedUser as never, payload });

    const error = await expectError(
      call(accountRouter.me, undefined, { context: ctx })
    );

    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "User not found",
    });
  });

  it("returns the user document", async () => {
    const userDoc = { id: "user-1", username: "tester", email: "t@e.com" };
    const payload = createFakePayload({ collections: { users: [userDoc] } });
    const ctx = mockContext({ user: authedUser as never, payload });

    const result = await call(accountRouter.me, undefined, { context: ctx });

    expect(result).toMatchObject({ id: "user-1", username: "tester" });
  });
});
