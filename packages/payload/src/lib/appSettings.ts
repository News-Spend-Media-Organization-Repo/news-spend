/**
 * App-wide copy that staff can change without a release.
 *
 * Every value has a code-level default, so an unsaved global (or a failed read)
 * still gives people something sensible to share. The app carries the same
 * default as an offline fallback; keep the two in step.
 */

/**
 * The domain that sends installed users to the app and everyone else to the
 * store. newsspend.com/download does not exist.
 */
export const SHARE_URL = "https://link.newsspend.com";

/** Where the link goes in the message. Staff type this, so keep it short. */
export const SHARE_LINK_TOKEN = "{link}";

export const DEFAULT_SHARE_MESSAGE = `News Spend is giving out Scholarships, Free Data/Airtime, Electronic Gadgets, Gift Cards and Information to help users achieve their dreams. I thought you or someone you know may be interested. You can download the App here: ${SHARE_LINK_TOKEN} OR search NewsSpend on your device store.`;

export type AppSettingsDoc = {
  shareMessage?: string | null;
} | null;

/**
 * The text a person shares to invite a friend, with the link filled in.
 *
 * A blank message means "use the default". A message that forgets the link
 * token still gets the link, on the end, because an invitation with no way to
 * install the app is worse than one with the link in an awkward place.
 */
export function resolveShareMessage(doc: AppSettingsDoc | undefined): string {
  const template = doc?.shareMessage?.trim() || DEFAULT_SHARE_MESSAGE;

  return template.includes(SHARE_LINK_TOKEN)
    ? template.split(SHARE_LINK_TOKEN).join(SHARE_URL)
    : `${template} ${SHARE_URL}`;
}
