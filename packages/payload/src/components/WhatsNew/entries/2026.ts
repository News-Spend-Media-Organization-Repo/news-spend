import type { Entry } from "../types";

/**
 * What goes here: only things staff would notice or need to act on — a new
 * page, a changed definition or number, a new limit or rule. Never fixes
 * nobody saw, refactors, or internals. Aim for one to three entries a month.
 */
export const entries2026: Entry[] = [
  {
    id: "2026-10-21-partner-performance",
    date: "2026-10-21",
    title: "Partners can see impressions and taps",
    sections: [
      {
        heading: "New",
        items: [
          "Partners see impressions, taps and tap-through by surface on their Performance tab.",
          "Staff get a page covering all partners, with outlier flags for numbers that look inflated, at /admin/analytics/partners-events.",
        ],
      },
      {
        heading: "Changed",
        items: [
          "Home-feed article impressions will rise from this release because they were under-counted before. They are not comparable with earlier weeks.",
        ],
      },
      {
        heading: "What to do",
        items: [
          "Nothing required. The Guide tab on a partner content item explains how these numbers are counted.",
        ],
      },
    ],
    link: {
      label: "Partner events",
      href: "/admin/analytics/partners-events",
    },
  },
  {
    id: "2026-10-20-partner-offers",
    date: "2026-10-20",
    title: "Partner ads and offers now behave differently",
    sections: [
      {
        heading: "New",
        items: [
          "Partner content has an Ad copy field. It is the only text shown off the earn surfaces, such as the news feed.",
          "A Guide tab on each partner content item shows what users see on each of its placements and checks it for mistakes.",
        ],
      },
      {
        heading: "Changed",
        items: [
          "Points only pay on Discover and Lucky App Wall. Tapping an ad anywhere else never pays.",
          "Offers a user has completed disappear from their lists.",
          "Offers waiting for the partner to confirm show in the app's Activities screen.",
        ],
      },
      {
        heading: "What to do",
        items: [
          "Fill in Ad copy on every partner content item, especially active ones, and keep reward wording out of it. Open the Guide tab to check an item.",
        ],
      },
    ],
    link: {
      label: "Partner content",
      href: "/admin/collections/partner-content",
    },
  },
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
