import { linking } from "../linking";

jest.mock(
  "expo-notifications",
  () => require("../../__mocks__/notification-link").notifications
);

jest.mock("expo-linking", () => ({
  createURL: (path: string) => `news-spend://${path}`,
  getInitialURL: jest.fn(async () => null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock("@swmansion/react-native-detour", () => ({
  DETOUR_LINKING_PREFIX: "detour://",
  Detour: {
    getInitialURL: jest.fn(async () => undefined),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock("#/lib/trackNotificationOpen", () => ({
  trackNotificationOpen: jest.fn(),
}));

jest.mock("#/lib/trackLegacyLink", () => ({
  trackLegacyTabLink: jest.fn(),
}));

jest.mock(
  "#/navigation/navigationUtils",
  () => require("../../__mocks__/notification-link").navigationUtils
);

type Notifications = {
  __state: { lastResponse: unknown };
  __listeners: Set<(response: unknown) => void>;
};

type Navigation = {
  __state: { ready: boolean };
  __readyListeners: Set<() => void>;
};

const notifications = () =>
  jest.requireMock("expo-notifications") as Notifications;
const navigation = () =>
  jest.requireMock("#/navigation/navigationUtils") as Navigation;

const article = (id: string) => ({
  actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
  notification: {
    date: 1,
    request: {
      identifier: id,
      trigger: { type: "push", payload: {} },
      content: {
        title: "Headline",
        body: "Body",
        data: { url: "article/some-slug", newsId: "news-1" },
      },
    },
  },
});

const ARTICLE_URL = "news-spend://article/some-slug?newsId=news-1";

const subscribe = (listener: jest.Mock) =>
  linking.subscribe?.(listener) ?? (() => undefined);

let listener: jest.Mock;

beforeEach(() => {
  listener = jest.fn();
  notifications().__state.lastResponse = null;
  notifications().__listeners.clear();
  navigation().__state.ready = true;
  navigation().__readyListeners.clear();
});

describe("notification deep links", () => {
  it("routes a response recorded after getInitialURL already ran", async () => {
    // Cold start: the tap has not reached the native emitter when the initial
    // URL is read, so it comes back empty.
    await expect(linking.getInitialURL?.()).resolves.toBeUndefined();

    // The Android forwarder's broadcast lands a moment later.
    notifications().__state.lastResponse = article("late");

    const unsubscribe = subscribe(listener);

    expect(listener).toHaveBeenCalledWith(ARTICLE_URL);

    unsubscribe();
  });

  it("holds a response until the navigator exists", async () => {
    await expect(linking.getInitialURL?.()).resolves.toBeUndefined();

    notifications().__state.lastResponse = article("late");
    navigation().__state.ready = false;

    const unsubscribe = subscribe(listener);

    // React Navigation drops links while its container ref is null, so the
    // tap must be replayed once the navigator is ready, not before.
    expect(listener).not.toHaveBeenCalled();

    navigation().__state.ready = true;
    for (const callback of navigation().__readyListeners) {
      callback();
    }

    expect(listener).toHaveBeenCalledWith(ARTICLE_URL);

    unsubscribe();
  });

  it("does not route the response the initial URL already used", async () => {
    notifications().__state.lastResponse = article("initial");

    await expect(linking.getInitialURL?.()).resolves.toBe(ARTICLE_URL);

    const unsubscribe = subscribe(listener);

    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("routes a tap that arrives while the app is running", () => {
    const unsubscribe = subscribe(listener);

    for (const callback of notifications().__listeners) {
      callback(article("live"));
    }

    expect(listener).toHaveBeenCalledWith(ARTICLE_URL);

    unsubscribe();
  });
});
