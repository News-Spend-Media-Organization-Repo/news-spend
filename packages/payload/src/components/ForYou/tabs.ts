const PATH = "@news-spend-media/payload/components/ForYou";

export const forYouMonitoringView = {
  Component: `${PATH}#ForYouMonitoringView`,
  path: "/for-you" as const,
  exact: true as const,
};

export const forYouMonitoringNavLink = `${PATH}#ForYouMonitoringNavLink`;
