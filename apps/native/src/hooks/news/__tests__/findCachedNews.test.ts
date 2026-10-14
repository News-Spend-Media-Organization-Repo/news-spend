import { findCachedNews } from "../findCachedNews";

const query = (data: unknown, dataUpdatedAt = 1) => ({
  state: { data, dataUpdatedAt },
});
const article = (slug: string, extra: object = {}) => ({
  id: slug,
  slug,
  title: `Title ${slug}`,
  type: "article",
  ...extra,
});

describe("findCachedNews", () => {
  it("finds an article in an infinite feed's pages", () => {
    const feed = query({
      pages: [{ docs: [article("a")] }, { docs: [article("b")] }],
    });

    expect(findCachedNews([feed], "b")?.item.slug).toBe("b");
  });

  it("finds an article in a plain array, like the trending carousel", () => {
    expect(
      findCachedNews([query([article("a"), article("t")])], "t")?.item.slug
    ).toBe("t");
  });

  it("finds an article nested under another key, like related news", () => {
    const one = query({ ...article("x"), relatedNews: [article("r")] });

    expect(findCachedNews([one], "r")?.item.slug).toBe("r");
  });

  it("returns nothing when no list holds it", () => {
    expect(findCachedNews([query([article("a")])], "missing")).toBeUndefined();
    expect(findCachedNews([], "a")).toBeUndefined();
  });

  it("prefers the most recently updated cache", () => {
    const older = query([article("a", { title: "old" })], 100);
    const newer = query([article("a", { title: "new" })], 200);

    expect(findCachedNews([older, newer], "a")?.item.title).toBe("new");
    expect(findCachedNews([newer, older], "a")?.dataUpdatedAt).toBe(200);
  });

  it("ignores ad slots, which have no slug", () => {
    const feed = query({ docs: [{ id: "ad-1", type: "ad" }, article("a")] });

    expect(findCachedNews([feed], "a")?.item.slug).toBe("a");
  });

  it("does not search inside an article body", () => {
    const one = query({
      ...article("x"),
      content: { root: { children: [article("hidden")] } },
    });

    expect(findCachedNews([one], "hidden")).toBeUndefined();
  });
});
