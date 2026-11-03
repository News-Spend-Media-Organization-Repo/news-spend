type PartnerLinks = {
  iosAppStore?: string | null;
  androidPlayStore?: string | null;
  website?: string | null;
};

export type PartnerLink = {
  url: string;
  /** Store links must leave the app; websites belong in the in-app browser. */
  isStore: boolean;
};

/**
 * The first usable link, and whether it is a store page.
 *
 * The CMS saves blank fields as `""`, so `"" ?? website` is `""` — a dead tap
 * with no event and no browser. Trim and skip empties before choosing.
 */
export function resolvePartnerLink(
  links: PartnerLinks | null | undefined,
  platform: "ios" | "android"
): PartnerLink | null {
  const store =
    platform === "ios" ? links?.iosAppStore : links?.androidPlayStore;
  const storeUrl = store?.trim();
  if (storeUrl) {
    return { url: storeUrl, isStore: true };
  }

  const website = links?.website?.trim();
  return website ? { url: website, isStore: false } : null;
}
