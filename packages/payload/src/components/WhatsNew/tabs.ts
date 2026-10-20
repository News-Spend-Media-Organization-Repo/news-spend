const PATH = "@news-spend-media/payload/components/WhatsNew";

/** The What's new page, registered with `exact` so it cannot answer prefixes. */
export const whatsNewPageView = {
  Component: `${PATH}#WhatsNewPageView`,
  path: "/whats-new" as const,
  exact: true as const,
};

export const whatsNewViews = {
  whatsNew: whatsNewPageView,
};

export const whatsNewNavLink = `${PATH}#WhatsNewNavLink`;
