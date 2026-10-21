import { AppState } from "react-native";

const mockStore = new Map<string, number>();
const mockRecordPrompt = jest.fn();
const mockLoadStoreReview = jest.fn();
const mockBreadcrumb = jest.fn();

jest.mock("#/utils/storage", () => ({
  storage: {
    getNumber: (key: string) => mockStore.get(key),
    set: (key: string, value: number) => {
      mockStore.set(key, value);
    },
  },
}));

jest.mock("#/lib/orpc", () => ({
  client: {
    review: {
      recordPrompt: (...args: unknown[]) => mockRecordPrompt(...args),
    },
  },
}));

jest.mock("../storeReview", () => ({
  loadStoreReview: () => mockLoadStoreReview(),
}));

jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: (...args: unknown[]) => mockBreadcrumb(...args),
}));

const DAY = 24 * 60 * 60 * 1000;
const PROMPTED_KEY = "review.promptedAt";

const requestReview = jest.fn();
const hasAction = jest.fn();

let appState = "active";

const load = () => {
  let mod!: typeof import("../index");
  jest.isolateModules(() => {
    mod = require("../index");
  });
  return mod;
};

/** Run a request to completion, flushing the settle delay. */
const run = async (
  maybeRequestReview: (trigger: "PRIZE_CLAIMED") => Promise<void>
) => {
  const pending = maybeRequestReview("PRIZE_CLAIMED");
  await jest.runAllTimersAsync();
  await pending;
};

beforeEach(() => {
  jest.useFakeTimers();
  mockStore.clear();
  jest.clearAllMocks();
  appState = "active";
  Object.defineProperty(AppState, "currentState", {
    configurable: true,
    get: () => appState,
  });
  hasAction.mockResolvedValue(true);
  requestReview.mockResolvedValue(undefined);
  mockLoadStoreReview.mockReturnValue({ hasAction, requestReview });
  mockRecordPrompt.mockResolvedValue({ won: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("maybeRequestReview", () => {
  it("skips without throwing when the native module is missing", async () => {
    mockLoadStoreReview.mockReturnValue(null);
    const { maybeRequestReview } = load();

    await run(maybeRequestReview);

    expect(mockRecordPrompt).not.toHaveBeenCalled();
    expect(requestReview).not.toHaveBeenCalled();
  });

  it("skips when the platform cannot show a review prompt", async () => {
    hasAction.mockResolvedValue(false);
    const { maybeRequestReview } = load();

    await run(maybeRequestReview);

    expect(mockRecordPrompt).not.toHaveBeenCalled();
    expect(requestReview).not.toHaveBeenCalled();
  });

  it("skips when the app is not in the foreground", async () => {
    appState = "background";
    const { maybeRequestReview } = load();

    await run(maybeRequestReview);

    expect(mockRecordPrompt).not.toHaveBeenCalled();
    expect(requestReview).not.toHaveBeenCalled();
  });

  it("skips inside 90 days from the local stamp and makes no server call", async () => {
    mockStore.set(PROMPTED_KEY, Date.now() - 10 * DAY);
    const { maybeRequestReview } = load();

    await run(maybeRequestReview);

    expect(mockRecordPrompt).not.toHaveBeenCalled();
    expect(requestReview).not.toHaveBeenCalled();
  });

  it("does not use up the slot when the app is backgrounded during the settle wait", async () => {
    const { maybeRequestReview } = load();

    const pending = maybeRequestReview("PRIZE_CLAIMED");
    await jest.advanceTimersByTimeAsync(100);
    appState = "background";
    await jest.runAllTimersAsync();
    await pending;

    expect(mockRecordPrompt).not.toHaveBeenCalled();
    expect(requestReview).not.toHaveBeenCalled();
  });

  it("goes ahead when the local stamp is older than 90 days", async () => {
    mockStore.set(PROMPTED_KEY, Date.now() - 91 * DAY);
    const { maybeRequestReview } = load();

    await run(maybeRequestReview);

    expect(requestReview).toHaveBeenCalledTimes(1);
  });

  it("passes the trigger and disables retries on the server call", async () => {
    const { maybeRequestReview } = load();

    await run(maybeRequestReview);

    expect(mockRecordPrompt).toHaveBeenCalledWith(
      { trigger: "PRIZE_CLAIMED" },
      { context: { retry: 0 } }
    );
  });

  it("calls requestReview exactly once and stamps the local cap when the server grants the slot", async () => {
    const { maybeRequestReview } = load();

    await run(maybeRequestReview);

    expect(requestReview).toHaveBeenCalledTimes(1);
    expect(mockStore.get(PROMPTED_KEY)).toBeGreaterThan(0);
  });

  it("does not prompt when the server declines", async () => {
    mockRecordPrompt.mockResolvedValue({ won: false, reason: "cooldown" });
    const { maybeRequestReview } = load();

    await run(maybeRequestReview);

    expect(requestReview).not.toHaveBeenCalled();
  });

  it("remembers a server cooldown locally so later attempts skip the call", async () => {
    mockRecordPrompt.mockResolvedValue({ won: false, reason: "cooldown" });
    const { maybeRequestReview } = load();

    await run(maybeRequestReview);
    await run(maybeRequestReview);

    expect(mockRecordPrompt).toHaveBeenCalledTimes(1);
  });

  it.each([
    "not_loyal",
    "disabled",
  ])("does not burn the local cap when the server says %s", async (reason) => {
    mockRecordPrompt.mockResolvedValue({ won: false, reason });
    const { maybeRequestReview } = load();

    await run(maybeRequestReview);

    expect(mockStore.has(PROMPTED_KEY)).toBe(false);
    expect(requestReview).not.toHaveBeenCalled();
  });

  it("does not prompt, throw, or burn the cap when the server call fails", async () => {
    mockRecordPrompt.mockRejectedValue(new Error("network down"));
    const { maybeRequestReview } = load();

    await expect(run(maybeRequestReview)).resolves.toBeUndefined();

    expect(requestReview).not.toHaveBeenCalled();
    expect(mockStore.has(PROMPTED_KEY)).toBe(false);
    expect(mockBreadcrumb).toHaveBeenCalled();
  });

  it("does not throw when the native dialog itself fails", async () => {
    requestReview.mockRejectedValue(new Error("StoreKit refused"));
    const { maybeRequestReview } = load();

    await expect(run(maybeRequestReview)).resolves.toBeUndefined();
  });

  it("produces one server call and one dialog for two concurrent requests", async () => {
    const { maybeRequestReview } = load();

    const first = maybeRequestReview("PRIZE_CLAIMED");
    const second = maybeRequestReview("PRIZE_DELIVERED");
    await jest.runAllTimersAsync();
    await Promise.all([first, second]);

    expect(mockRecordPrompt).toHaveBeenCalledTimes(1);
    expect(requestReview).toHaveBeenCalledTimes(1);
  });
});
