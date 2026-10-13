import { withArticleUnderComments } from "../article-under-comments";

const names = (state: ReturnType<typeof withArticleUnderComments>) =>
  state?.routes.map((route) => route.name);

describe("withArticleUnderComments", () => {
  it("inserts the article under a reply screen", () => {
    const state = withArticleUnderComments({
      index: 1,
      routes: [
        { name: "Tab" },
        {
          name: "CommentReply",
          params: { newsSlug: "a-story", commentId: "c" },
        },
      ],
    });

    expect(names(state)).toEqual(["Tab", "News", "CommentReply"]);
    expect(state?.index).toBe(2);
    expect(state?.routes[1]?.params).toEqual({ slug: "a-story" });
  });

  it("does the same for the comment list", () => {
    const state = withArticleUnderComments({
      index: 1,
      routes: [{ name: "Tab" }, { name: "Comment", params: { newsSlug: "s" } }],
    });

    expect(names(state)).toEqual(["Tab", "News", "Comment"]);
  });

  it("leaves other links alone", () => {
    const state = {
      index: 1,
      routes: [{ name: "Tab" }, { name: "News", params: { slug: "s" } }],
    };

    expect(withArticleUnderComments(state)).toBe(state);
  });

  it("does not add a second article", () => {
    const state = {
      index: 2,
      routes: [
        { name: "Tab" },
        { name: "News", params: { slug: "s" } },
        { name: "Comment", params: { newsSlug: "s" } },
      ],
    };

    expect(withArticleUnderComments(state)).toBe(state);
  });

  it("leaves a comment link with no slug alone", () => {
    const state = { index: 1, routes: [{ name: "Tab" }, { name: "Comment" }] };

    expect(withArticleUnderComments(state)).toBe(state);
  });

  it("passes undefined through", () => {
    expect(withArticleUnderComments(undefined)).toBeUndefined();
  });
});
