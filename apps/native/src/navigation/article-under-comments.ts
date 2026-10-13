/** Only the fields read here, so any navigation state shape satisfies it. */
type RootState = {
  index?: number | undefined;
  routes: { name: string; params?: object | undefined }[];
};

const COMMENT_ROUTES = new Set(["Comment", "CommentReply"]);

/**
 * A comment link (a reply push, a shared thread) names its article in the path,
 * but resolves to a stack of just `[Tab, Comment…]`. Back from there skipped
 * the article the comments belong to and went straight Home.
 *
 * Inserts the article between them: `[Tab, News, Comment…]`. Only the root
 * stack is touched, and only when the link ends on a comment screen, so every
 * other link resolves exactly as before.
 */
export function withArticleUnderComments<T extends RootState | undefined>(
  state: T
): T {
  const routes = state?.routes;
  const last = routes?.at(-1);

  if (!(state && routes && last && COMMENT_ROUTES.has(last.name))) {
    return state;
  }

  const slug = (last.params as { newsSlug?: unknown } | undefined)?.newsSlug;
  if (typeof slug !== "string" || !slug.length) {
    return state;
  }

  // Already has the article underneath (e.g. an in-app link): leave it alone.
  if (routes.some((route) => route.name === "News")) {
    return state;
  }

  const nextRoutes = [
    ...routes.slice(0, -1),
    { name: "News", params: { slug } },
    last,
  ];

  return { ...state, routes: nextRoutes, index: nextRoutes.length - 1 };
}
