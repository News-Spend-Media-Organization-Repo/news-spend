import { APP_SCREENS } from "@news-spend-media/utils/appRoutes";
import {
  createPathConfigForStaticNavigation,
  getStateFromPath,
} from "@react-navigation/core";

import { sharedScreens } from "../shared-screens";
import { TAB_PATHS } from "../tab-paths";

// Built from the real `sharedScreens` map, so a path declared there that stops
// resolving (a typo, a collision with another route) fails here rather than on
// a user's phone as a "Page not found".
const config = {
  screens: createPathConfigForStaticNavigation(
    { config: { screens: sharedScreens } } as never,
    {},
    true
  ),
} as never;

const routeNames = (path: string) =>
  getStateFromPath(path, config)?.routes.map((route) => route.name);

describe("deep link paths", () => {
  it.each([
    ["article/some-slug", "News"],
    ["article/some-slug/abc", "News"],
    ["article/some-slug/comment", "Comment"],
    ["article/some-slug/comment/c1", "CommentReply"],
    ["article/some-slug/comment/c1/c2", "CommentReply"],
    ["detail/some-slug", "ShopDetails"],
    ["profile", "Profile"],
  ])("%s resolves to %s", (path, name) => {
    expect(routeNames(path)).toEqual([name]);
  });

  it("passes the slug through as a param", () => {
    const route = getStateFromPath("article/some-slug", config)?.routes[0];

    expect(route?.params).toMatchObject({ slug: "some-slug" });
  });

  it("passes a web page url through to the browser screen", () => {
    const route = getStateFromPath(
      "browser?url=https%3A%2F%2Fexample.com%2Fpage",
      config
    )?.routes[0];

    expect(route?.name).toBe("InAppBrowser");
    expect(route?.params).toMatchObject({ url: "https://example.com/page" });
  });

  it("falls through to NotFound for an unknown path", () => {
    expect(routeNames("no/such/path")).toEqual(["NotFound"]);
  });

  it("does not match a bare article link with no slug", () => {
    expect(routeNames("article")).toEqual(["NotFound"]);
  });
});

/**
 * The tab-prefixed form the share sheet used to mint. It is declared as an
 * `alias` on each news route, so the router resolves it without any
 * pre-navigation rewriting.
 */
describe("tab-prefixed article aliases", () => {
  it.each([
    ["news/article/some-slug", "News"],
    ["news/article/some-slug/abc", "News"],
    ["news/article/some-slug/comment", "Comment"],
    ["news/article/some-slug/comment/c1", "CommentReply"],
    ["news/article/some-slug/comment/c1/c2", "CommentReply"],
  ])("%s resolves to %s", (path, name) => {
    expect(routeNames(path)).toEqual([name]);
  });

  it("passes the slug through as a param", () => {
    const route = getStateFromPath("news/article/some-slug", config)?.routes[0];

    expect(route?.params).toMatchObject({ slug: "some-slug" });
  });

  it("resolves the slug from the shared link in the report", () => {
    const slug =
      "breaking-12-killed-over-300-injured-in-riyadh-airport-attack-saudi-authorities-say";
    const route = getStateFromPath(`news/article/${slug}`, config)?.routes[0];

    expect(route?.name).toBe("News");
    expect(route?.params).toMatchObject({ slug });
  });
});

/**
 * `linking.config.initialRouteName` is what puts `Tab` under a detail screen
 * opened from a notification. Without it the stack holds one route, and the
 * hardware back button / edge swipe has nowhere to go.
 */
describe("initial route under deep links", () => {
  const configWithTab = {
    initialRouteName: "Tab",
    screens: {
      Tab: { path: "tab" },
      ...(config as unknown as { screens: Record<string, unknown> }).screens,
    },
  } as never;

  const names = (path: string) =>
    getStateFromPath(path, configWithTab)?.routes.map((route) => route.name);

  it.each([
    "article/some-slug",
    "article/some-slug/comment",
    "article/some-slug/comment/c1/c2",
    "news/article/some-slug",
  ])("%s resolves with Tab underneath", (path) => {
    const routes = names(path);

    expect(routes?.[0]).toBe("Tab");
    expect(routes).toHaveLength(2);
  });

  it("does not stack Tab on itself", () => {
    expect(names("tab")).toEqual(["Tab"]);
  });
});

/**
 * The CMS destination picker offers `APP_SCREENS` from the shared utils
 * package. This is the other half of that contract: a screen added, renamed or
 * removed in the navigator must be reflected there, or the picker drifts.
 *
 * Excluded: `*` (the NotFound catch-all), `toast-lab` (a dev-only bench) and
 * parameterised paths (comment threads, prizes — not picker destinations).
 */
describe("notification destinations", () => {
  const linkedPaths = (screens: Record<string, unknown>) =>
    Object.values(screens)
      .map(
        (screen) => (screen as { linking?: { path?: string } }).linking?.path
      )
      .filter((path): path is string => typeof path === "string");

  it("matches the screens the notification picker offers", () => {
    const appPaths = [
      ...linkedPaths(sharedScreens),
      ...Object.values(TAB_PATHS),
    ]
      .filter(
        (path) => !path.includes(":") && path !== "*" && path !== "toast-lab"
      )
      .sort();

    expect(appPaths).toEqual(APP_SCREENS.map(({ value }) => value).sort());
  });
});
