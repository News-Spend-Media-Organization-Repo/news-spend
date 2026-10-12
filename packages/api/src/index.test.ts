import { beforeEach, describe, expect, it, mock } from "bun:test";
import { call, os } from "@orpc/server";

const captureException = mock(() => undefined);
mock.module("@sentry/node", () => ({
  captureException,
  default: { captureException },
}));

// Imported after the mock so `sentryMiddleware` sees the stubbed client.
import { sentryMiddleware } from "./index";
import { expectError } from "./test-utils";

describe("sentryMiddleware", () => {
  beforeEach(() => {
    captureException.mockClear();
  });
  it("does not report defined client errors (e.g. UNAUTHORIZED)", async () => {
    const proc = os
      .errors({ UNAUTHORIZED: { message: "Unauthorized" } })
      .use(sentryMiddleware)
      .handler(async ({ errors }) => {
        throw errors.UNAUTHORIZED();
      });

    const error = await expectError(call(proc, {}, { context: {} }));

    expect(error).toMatchObject({ code: "UNAUTHORIZED" });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reports defined INTERNAL_SERVER_ERROR", async () => {
    const proc = os
      .errors({ INTERNAL_SERVER_ERROR: { message: "Internal server error" } })
      .use(sentryMiddleware)
      .handler(async ({ errors }) => {
        throw errors.INTERNAL_SERVER_ERROR();
      });

    const error = await expectError(call(proc, {}, { context: {} }));

    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("reports unexpected non-ORPC errors", async () => {
    const proc = os.use(sentryMiddleware).handler(async () => {
      throw new TypeError("cannot connect to Postgres");
    });

    const error = await expectError(call(proc, {}, { context: {} }));

    expect(error).toMatchObject({ message: "cannot connect to Postgres" });
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
