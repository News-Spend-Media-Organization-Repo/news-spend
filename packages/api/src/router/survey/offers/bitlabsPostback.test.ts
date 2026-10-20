import { beforeEach, describe, expect, it } from "bun:test";
import { call } from "@orpc/server";

import {
  createFakePayload,
  expectError,
  mockContext,
} from "../../../test-utils";
import { bitlabsPostbackHandler, signBitLabsUrl } from "./bitlabsPostback";

const BASE = "https://api.newsspend.com/api/survey/bitlabs/postback";
const SECRET = "JLOIAUNMHFli7ZJOQVEzm98rzqnm9";

type Fake = ReturnType<typeof createFakePayload>;

const postback = (
  payload: Fake,
  fields: Record<string, string | number>,
  options: { hash?: "valid" | "wrong" | "none" } = {}
) => {
  const query = new URLSearchParams(
    Object.entries(fields).map(
      ([key, value]) => [key, String(value)] as [string, string]
    )
  ).toString();
  const url = `${BASE}?${query}`;
  const hash = signBitLabsUrl(SECRET, url);
  const requestUrl =
    options.hash === "none"
      ? url
      : `${url}&hash=${options.hash === "wrong" ? "bad" : hash}`;

  return call(
    bitlabsPostbackHandler,
    {
      ...fields,
      ...(options.hash === "none"
        ? {}
        : { hash: options.hash === "wrong" ? "bad" : hash }),
    } as never,
    {
      context: mockContext({ payload, request: new Request(requestUrl) }),
    }
  );
};

const freshPayload = (globals?: Record<string, unknown>): Fake =>
  createFakePayload({
    collections: {
      users: [{ id: "user-1" }, { id: "user-2" }],
      "push-tokens": [],
    },
    ...(globals ? { globals: globals as never } : {}),
  });

beforeEach(() => {
  process.env.BITLABS_SECRET = SECRET;
});

describe("BitLabs signature", () => {
  it("matches their published example", () => {
    expect(
      signBitLabsUrl(
        SECRET,
        "https://publisher.com/complete?uid=8cc877ee-af19-488d-b28d-216fb866b996&val=500"
      )
    ).toBe("dbcd6bb8ca677344592842a52b4fca9bec36cd4b");
  });
});

describe("BitLabs postback", () => {
  it("pays a completion and records the provider reference", async () => {
    const payload = freshPayload();

    const res = await postback(payload, {
      uid: "user-1",
      tx: "b1",
      value: 300,
      type: "COMPLETE",
    });

    expect(res).toEqual({ success: true });
    expect(payload.docs("activities")[0]).toMatchObject({
      point: 300,
      user: "user-1",
      providerRef: "bitlabs:b1:award",
    });
  });

  it("pays a repeated transaction once", async () => {
    const payload = freshPayload();
    const fields = { uid: "user-1", tx: "b1", value: 300, type: "COMPLETE" };

    await postback(payload, fields);
    await postback(payload, fields);

    expect(payload.docs("activities")).toHaveLength(1);
  });

  it("pays nothing for a screenout", async () => {
    const payload = freshPayload();

    await postback(payload, {
      uid: "user-1",
      tx: "b2",
      value: 0,
      type: "SCREENOUT",
    });

    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("reverses what a reconciliation names", async () => {
    const payload = freshPayload();
    await postback(payload, {
      uid: "user-1",
      tx: "b3",
      value: 300,
      type: "COMPLETE",
    });

    await postback(payload, {
      uid: "user-1",
      tx: "b3",
      value: 300,
      type: "RECONCILIATION",
    });

    const docs = payload.docs("activities");
    expect(docs).toHaveLength(2);
    expect(docs[1]).toMatchObject({ point: -300, action: "pointReversal" });
  });

  it("pays a start bonus under its own transaction", async () => {
    const payload = freshPayload();

    await postback(payload, {
      uid: "user-1",
      tx: "b4",
      value: 10,
      type: "START_BONUS",
    });
    await postback(payload, {
      uid: "user-1",
      tx: "b4",
      value: 300,
      type: "COMPLETE",
    });

    expect(payload.docs("activities").map((doc) => doc.providerRef)).toEqual([
      "bitlabs:b4:start:award",
      "bitlabs:b4:award",
    ]);
  });

  it("rejects a missing or wrong hash and pays nothing", async () => {
    const payload = freshPayload();
    const fields = { uid: "user-1", tx: "b5", value: 300, type: "COMPLETE" };

    expect(await postback(payload, fields, { hash: "none" })).toEqual({
      error: "Invalid hash",
    });
    expect(await postback(payload, fields, { hash: "wrong" })).toEqual({
      error: "Invalid hash",
    });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("answers success for a permanent refusal", async () => {
    const payload = freshPayload({
      "survey-settings": { maxPointsPerAward: 100, dailyPointsCap: 1000 },
    });

    const res = await postback(payload, {
      uid: "user-1",
      tx: "b6",
      value: 300,
      type: "COMPLETE",
    });

    expect(res).toEqual({ success: true });
    expect(payload.docs("activities")).toHaveLength(0);
  });

  it("fails the request when the points could not be saved", async () => {
    const payload = freshPayload();
    payload.create = (() =>
      Promise.reject(new Error("database down"))) as never;

    const error = await expectError(
      postback(payload, {
        uid: "user-1",
        tx: "b7",
        value: 300,
        type: "COMPLETE",
      })
    );

    expect(error.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
