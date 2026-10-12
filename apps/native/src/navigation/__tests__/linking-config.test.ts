import {
  createPathConfigForStaticNavigation,
  getStateFromPath,
} from "@react-navigation/core";

import { sharedScreens } from "../shared-screens";

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

  it("falls through to NotFound for an unknown path", () => {
    expect(routeNames("no/such/path")).toEqual(["NotFound"]);
  });

  it("does not match a bare article link with no slug", () => {
    expect(routeNames("article")).toEqual(["NotFound"]);
  });
});
