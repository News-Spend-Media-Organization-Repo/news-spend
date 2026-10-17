import { Linking } from "react-native";

/**
 * Opens an app-store link, trying every way it can before giving up.
 *
 * A bare `Linking.openURL(playStoreUrl)` is refused on some Android phones
 * ("Permission Denial: starting Intent"), typically when whatever is set to
 * handle play.google.com links is not an app we are allowed to start. The tap
 * then does nothing, on a partner click that earns money, and the rejection
 * goes unhandled. The Play Store's own `market://` scheme goes to the store
 * directly and does not depend on that handler.
 *
 * Resolves true when something opened. False means every route failed, and the
 * caller should fall back to showing the page in the app.
 */
export const openStoreLink = async (url: string): Promise<boolean> => {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    // Fall through to the store's own scheme.
  }

  const market = toMarketUrl(url);
  if (market) {
    try {
      await Linking.openURL(market);
      return true;
    } catch {
      // Nothing left to try here.
    }
  }

  return false;
};

/** `https://play.google.com/store/apps/details?id=x&..` -> `market://details?id=x&..` */
export const toMarketUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname !== "play.google.com" ||
      !parsed.searchParams.get("id")
    ) {
      return null;
    }
    return `market://details${parsed.search}`;
  } catch {
    return null;
  }
};
