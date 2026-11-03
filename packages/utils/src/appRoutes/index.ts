/**
 * Screens a push notification can open, shared by the CMS destination picker
 * and the mobile router.
 *
 * The app declares these same paths in `apps/native/src/navigation`; its
 * `linking-config` test asserts the two lists match, so a screen added or
 * renamed there fails the build instead of quietly falling out of the picker.
 */
export const APP_TAB_ROOTS = ["news", "discover", "shop", "settings"] as const;

const TAB_DESTINATIONS = [
  { label: "News feed", value: "news" },
  { label: "Discover", value: "discover" },
  { label: "Shop", value: "shop" },
  { label: "Settings home", value: "settings" },
];

const SCREEN_DESTINATIONS = [
  { label: "Profile", value: "profile" },
  { label: "Notification settings", value: "notification" },
  { label: "Activities", value: "activities" },
  { label: "Data manager", value: "data-manager" },
  { label: "Delete account", value: "delete-account" },
  { label: "Blocked users", value: "blocked-users" },
  { label: "Report (IWitness)", value: "report" },
  { label: "Share app", value: "share-app" },
  { label: "Follow us", value: "socials" },
  { label: "Contact us", value: "support" },
  { label: "FAQ", value: "faq" },
  { label: "Send feedback", value: "feedback" },
  { label: "Email support", value: "email" },
  { label: "Call us", value: "call" },
  { label: "Advertise", value: "advertise" },
  { label: "Verify identity", value: "identity-verification" },
  { label: "Legal agreement", value: "legal" },
  { label: "Terms of use", value: "terms-of-use" },
  { label: "Privacy policy", value: "privacy-policy" },
  { label: "Community guidelines", value: "community-guidelines" },
  { label: "Play giveaway", value: "play-lottery" },
  { label: "Buy tickets", value: "buy-ticket" },
  { label: "Boost luck", value: "boost-luck" },
  { label: "Lucky app wall", value: "lucky-app-wall" },
  { label: "My giveaways", value: "my-giveaways" },
  { label: "Giveaway rules", value: "lottery-rules" },
  { label: "Survey", value: "survey" },
  { label: "In-app browser", value: "browser" },
];

/** Single-segment screens the app declares. */
export const APP_SCREENS = [...TAB_DESTINATIONS, ...SCREEN_DESTINATIONS];

/**
 * Screens that only render with params. `browser` and `survey` are the same
 * WebView screen and need `?url=`, so offering them alone would open a blank
 * page. Links that carry the URL still route; the picker just cannot build one.
 */
const SCREENS_NEEDING_PARAMS = new Set(["browser", "survey"]);

/** What the CMS destination picker offers. */
export const NOTIFICATION_DESTINATIONS = APP_SCREENS.filter(
  (screen) => !SCREENS_NEEDING_PARAMS.has(screen.value)
);

/** Detail screens that take a path segment after the name. */
export const APP_PATH_FAMILIES = [
  "article/",
  "detail/",
  "entry-details/",
  "claim-prize/",
  "prize/",
  "games/",
];
