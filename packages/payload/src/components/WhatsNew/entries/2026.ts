import type { Entry } from "../types";

/**
 * What goes here: only things staff would notice or need to act on — a new
 * page, a changed definition or number, a new limit or rule. Never fixes
 * nobody saw, refactors, or internals. Aim for one to three entries a month.
 */
export const entries2026: Entry[] = [
  {
    id: "2026-10-20-release-2-7-0",
    date: "2026-10-20",
    version: "2.7.0",
    title: "Pages for points, retention and what changed",
    sections: [
      {
        heading: "New",
        items: [
          "The Points page shows where Dream Points are issued, spent and held, including the largest single grants.",
          "The Retention page shows whether new accounts start reading, and whether new devices come back.",
          "Top articles are ranked by unique readers, and you can change the ranking from the page.",
          "Charts on the analytics pages were rebuilt: hover a bar for the exact value, and the key figures carry a small trend line.",
          "Guest events records when a guest account is created and when it becomes a registered user.",
        ],
      },
      {
        heading: "Changed",
        items: [
          "Click-through now counts a device once per article it was shown, so it can no longer pass 100%. It is not comparable with earlier weeks.",
          "Survey, news and partner-content points cannot be saved above 5,000.",
          "The News analytics page has a Direct opens figure: views that did not follow an impression of the article on the same device.",
          "The Analytics pages now show the admin sidebar and header; before, you had to go back to a collection to see the sidebar.",
        ],
      },
      {
        heading: "What to do",
        items: [
          "If you edit a survey that pays more than 5,000 points, lower its points before saving.",
        ],
      },
    ],
    link: { label: "Open the Points page", href: "/admin/analytics/points" },
  },
];
