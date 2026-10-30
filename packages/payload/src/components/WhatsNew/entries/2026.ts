import type { Entry } from "../types";

/**
 * What goes here: only things staff would notice or need to act on — a new
 * page, a changed definition or number, a new limit or rule. Never fixes
 * nobody saw, refactors, or internals. Aim for one to three entries a month.
 */
export const entries2026: Entry[] = [
  {
    id: "2026-10-30-roles-and-share-message",
    date: "2026-10-30",
    title: "Tighter roles, a 7-day claim window, and an editable share message",
    sections: [
      {
        heading: "New",
        items: [
          "App Settings has a Share App message. Write {link} where the download link goes; the app uses it the next time someone opens Share App.",
          "The points leaderboard and the Large point grants panel show each user's name, and the leaderboard adds Peak hour and Events to spot points earned unusually fast.",
          "Ad and Read Also blocks now preview in the article editor: an ad at its real size, and the linked article's title.",
          "A partner opens straight onto their own Performance tab, and can view their own partner content (read only).",
        ],
      },
      {
        heading: "Changed",
        items: [
          "Viewers are read-only everywhere. Editors keep content and moderation.",
          "Points and prize records (activities, surveys, giveaways, prize catalogue, partner conversions) can only be changed by Super Admins and Content Managers.",
          "Only Super Admins and Content Managers see the API tab and who created or last changed a record, and only they can edit partners.",
          "Winners now have 7 days to claim a prize, down from 14, or until the next giveaway starts. Winners already picked keep their 14 days.",
          "Saving an article draft prefills the push title from the headline and the push body from the first key point; change either and it stays. A new article now needs at least one key point to publish.",
        ],
      },
      {
        heading: "What to do",
        items: [
          "If someone needs to edit surveys or giveaways, make them a Content Manager.",
          'Update the FAQ "How long do I have to claim a giveaway prize?" to say 7 days.',
        ],
      },
    ],
  },
  {
    id: "2026-10-30-dashboard-navigation",
    date: "2026-10-30",
    title: "A way back to the dashboard, and partners at a glance",
    sections: [
      {
        heading: "New",
        items: [
          "Every admin screen now has a Dashboard link in the sidebar, and the header logo is clickable again.",
          "A partner account has a Performance link in the sidebar that opens its own Performance tab.",
          "The staff dashboard has a Partners by integration widget, counting partners by manual, webhook and CSV.",
          "Analytics pages have a Custom date range: pick any start and end day, up to a year, and every card on the page follows it.",
          "Publishing an article can send its own push title and body, with an on/off switch, so a caution like BREAKING stays out of the headline.",
        ],
      },
      {
        heading: "Changed",
        items: [
          "The partner list shows the integration method as a column, so it can be filtered without opening a record.",
          "Top articles shows each article's publication date, and says whether the ranking covers the whole period or is the hot-now Rising view.",
        ],
      },
    ],
  },
  {
    id: "2026-10-22-delete-guards",
    date: "2026-10-22",
    title:
      "Deletes no longer strip articles of their category, image or author",
    sections: [
      {
        heading: "Changed",
        items: [
          "Deleting a category or a media file now stops while anything still uses it, and says how many records to move first.",
          "Deleting an admin now sends the account to Trash instead of removing it, so their articles keep the byline. The permanent delete is refused while they are still credited.",
        ],
      },
      {
        heading: "What to do",
        items: [
          "When retiring a category or file, move the articles and promo blocks that use it to the replacement first.",
          "If an admin leaves, keep the account in Trash. Restore it from Trash if you removed one by mistake.",
        ],
      },
    ],
  },
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
