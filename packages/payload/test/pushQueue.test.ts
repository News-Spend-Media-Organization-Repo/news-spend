import { describe, expect, it, mock } from "bun:test";
import type { CollectionAfterChangeHook } from "payload";

const sendNotification = mock(() => Promise.resolve());
// Keep every real export: module mocks are shared by all test files, and other
// tests import `titleFor` from this same module.
const realPushService = await import("../src/lib/expo-push-service");
mock.module("../src/lib/expo-push-service", () => ({
  ...realPushService,
  sendNotification,
}));

const { PUSH_QUEUE, queueNotificationSend } = await import(
  "../src/lib/pushQueue"
);
const { default: Notifications } = await import(
  "../src/collections/Notifications"
);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function requestFor(options: { runFails?: boolean; context?: object } = {}) {
  const queue = mock(() => Promise.resolve({}));
  const run = mock(() =>
    options.runFails
      ? Promise.reject(new Error("db down"))
      : Promise.resolve({})
  );
  const error = mock(() => undefined);
  return {
    queue,
    run,
    error,
    req: {
      context: options.context ?? {},
      payload: {
        jobs: { queue, run },
        logger: { error },
        delete: mock(() => Promise.resolve({})),
      },
    },
  };
}

describe("queueNotificationSend", () => {
  it("queues the send on the push queue, inside the caller's transaction", async () => {
    const { req, queue } = requestFor();

    await queueNotificationSend(req as never, "n-1", []);

    expect(queue).toHaveBeenCalledTimes(1);
    expect(queue.mock.calls[0]).toEqual([
      {
        task: "sendScheduledNotification",
        queue: PUSH_QUEUE,
        input: { notificationId: "n-1" },
        req,
      },
    ]);
  });

  it("starts only the push queue, a few times, shortly afterwards", async () => {
    const { req, run } = requestFor();

    await queueNotificationSend(req as never, "n-1", [5, 15, 25]);
    expect(run).not.toHaveBeenCalled();
    await wait(80);

    expect(run).toHaveBeenCalledTimes(3);
    for (const call of run.mock.calls) {
      expect(call).toEqual([{ queue: PUSH_QUEUE, limit: 5 }]);
    }
  });

  it("returns before the send has run", async () => {
    const { req, run } = requestFor();

    await queueNotificationSend(req as never, "n-1", [200]);

    expect(run).not.toHaveBeenCalled();
  });

  it("logs a runner that cannot start instead of throwing", async () => {
    const { req, error } = requestFor({ runFails: true });

    await queueNotificationSend(req as never, "n-1", [5]);
    await wait(40);

    expect(error).toHaveBeenCalledTimes(1);
  });

  it("does not hold the process open for a pending nudge", async () => {
    const { req } = requestFor();

    // A nudge that would outlive the test run must not keep the runner alive.
    await queueNotificationSend(req as never, "n-1", [60_000]);
  });
});

describe("the Notifications send-now hook", () => {
  const hook = Notifications.hooks
    ?.afterChange?.[0] as CollectionAfterChangeHook;
  const published = {
    _status: "published",
    deliveryAction: "send-now",
    id: "n-1",
  };
  const run = (req: unknown) =>
    hook({ operation: "create", doc: { ...published }, req } as never);

  it("queues the send when the caller asked not to wait", async () => {
    sendNotification.mockClear();
    const { req, queue } = requestFor({ context: { deferSend: true } });

    await run(req);

    expect(queue).toHaveBeenCalledTimes(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("still sends before returning for a campaign sent from the admin", async () => {
    sendNotification.mockClear();
    const { req, queue } = requestFor();

    await run(req);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(queue).not.toHaveBeenCalled();
  });
});
