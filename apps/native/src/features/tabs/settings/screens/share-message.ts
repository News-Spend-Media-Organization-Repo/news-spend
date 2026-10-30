import { useQuery } from "@tanstack/react-query";
import { orpc } from "#/lib/orpc";

/**
 * Shown while the CMS message loads, offline, or when the server is older than
 * the app and has no such endpoint. It is the same text as the default in
 * `lib/appSettings` in the payload package, with the link filled in; keep the
 * two in step.
 *
 * link.newsspend.com is the Detour domain, which sends installed users to the
 * app and everyone else to the store. newsspend.com/download does not exist.
 */
export const FALLBACK_SHARE_MESSAGE =
  "News Spend is giving out Scholarships, Free Data/Airtime, Electronic Gadgets, Gift Cards and Information to help users achieve their dreams. I thought you or someone you know may be interested. You can download the App here: https://link.newsspend.com OR search NewsSpend on your device store.";

/**
 * The invitation to share, as staff have written it in the CMS.
 *
 * The whole text is sent as the message with the link already inside it, and
 * the separate `url` field is left out: share targets append that after the
 * message, which would strand the store-search hint ahead of the link.
 */
export function useShareMessage(): string {
  const { data } = useQuery({
    ...orpc.appSettings.getShareMessage.queryOptions(),
    staleTime: 0,
    refetchOnMount: "always",
  });

  return data?.message?.trim() || FALLBACK_SHARE_MESSAGE;
}
