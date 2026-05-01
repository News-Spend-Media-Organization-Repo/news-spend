import { useDetourContext } from "@swmansion/react-native-detour";
import { useEffect } from "react";

import { notifyDeepLink } from "#/navigation/linking";

/**
 * Listens for deferred deep links resolved by the Detour SDK (first-install
 * scenario) and forwards them to React Navigation via notifyDeepLink.
 *
 * Must be rendered inside <DetourProvider>.
 * Renders nothing — side-effects only.
 */
export function DetourDeepLinkHandler() {
  const { isLinkProcessed, link, clearLink } = useDetourContext();

  useEffect(() => {
    if (!(isLinkProcessed && link)) {
      return;
    }

    notifyDeepLink(link.url.toString());
    clearLink();
  }, [isLinkProcessed, link, clearLink]);

  return null;
}
