import {
  linking,
  notificationDataPath,
  notificationDataTarget,
} from "../linking";

jest.mock(
  "expo-notifications",
  () => require("../../__mocks__/notification-link").notifications
);

jest.mock("expo-linking", () => ({
  createURL: (path: string) => encodeURI(`news-spend://${path}`),
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

  it("passes an encoded web page address through only once", () => {
    const unsubscribe = subscribe(listener);

    notifications().__state.lastResponse = {
      actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
      notification: {
        date: 1,
        request: {
          identifier: "web",
          trigger: { type: "push", payload: {} },
          content: {
            title: "Headline",
            body: "Body",
            data: {
              url: "browser?url=https%3A%2F%2Fogwugo.com&confirmOnLeave=false",
            },
          },
        },
      },
    };

    for (const callback of notifications().__listeners) {
      callback(notifications().__state.lastResponse);
    }

    expect(listener).toHaveBeenCalledWith(
      "news-spend://browser?url=https%3A%2F%2Fogwugo.com&confirmOnLeave=false"
    );

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

describe("notificationDataTarget", () => {
  it("builds the app URL from url and newsId", () => {
    expect(
      notificationDataTarget({ url: "article/some-slug", newsId: "news-1" })
    ).toBe(ARTICLE_URL);
  });

  it("strips a legacy tab prefix", () => {
    expect(
      notificationDataTarget({
        url: "news/article/some-slug",
        newsId: "news-1",
      })
    ).toBe(ARTICLE_URL);
  });

  it("passes an encoded web page address through only once", () => {
    expect(
      notificationDataTarget({
        url: "browser?url=https%3A%2F%2Fogwugo.com&confirmOnLeave=false",
      })
    ).toBe(
      "news-spend://browser?url=https%3A%2F%2Fogwugo.com&confirmOnLeave=false"
    );
  });

  it("returns undefined without a url", () => {
    expect(notificationDataTarget(undefined)).toBeUndefined();
    expect(notificationDataTarget({ newsId: "news-1" })).toBeUndefined();
    expect(notificationDataTarget({ url: "" })).toBeUndefined();
  });

  it("does not append an empty news id", () => {
    expect(notificationDataTarget({ url: "article/some-slug" })).toBe(
      "news-spend://article/some-slug"
    );
  });
});

describe("notificationDataPath", () => {
  it("returns an in-app path with the news id and no scheme", () => {
    expect(
      notificationDataPath({ url: "article/some-slug", newsId: "news-1" })
    ).toBe("/article/some-slug?newsId=news-1");
  });

  it("strips a legacy tab prefix and leading slashes", () => {
    expect(notificationDataPath({ url: "/news/article/some-slug" })).toBe(
      "/article/some-slug"
    );
  });

  it("drops an app scheme the url already carries", () => {
    expect(
      notificationDataPath({ url: "news-spend://article/some-slug" })
    ).toBe("/article/some-slug");
  });

  it("returns undefined without a url", () => {
    expect(notificationDataPath(undefined)).toBeUndefined();
    expect(notificationDataPath({ url: "" })).toBeUndefined();
  });
});
