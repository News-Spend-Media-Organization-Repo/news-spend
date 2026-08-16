import type { PartnerContent } from "@news-spend-media/payload/types";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Linking, Platform } from "react-native";
import { toast } from "sonner-native";

import { orpc } from "#/lib/orpc";
import { navigate } from "#/navigation/navigationUtils";

export function usePartnerClick() {
  const trackClickMutation = useMutation(
    orpc.partnerConversions.trackClick.mutationOptions()
  );
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);

  const handleClick = async (item: PartnerContent) => {
    if (loadingItemId === item.id) {
      return;
    }

    const partner = typeof item.partner === "object" ? item.partner : undefined;
    const isCPA =
      partner?.integrationMethod === "webhook" ||
      partner?.integrationMethod === "postback";

    // Store links have to leave the app — the App Store / Play Store cannot
    // render in a WebView. Website links stay in the in-app browser.
    const storeUrl = Platform.select({
      ios: item.links?.iosAppStore,
      android: item.links?.androidPlayStore,
    });
    let url = storeUrl ?? item.links?.website;

    if (!url) {
      return;
    }

    const isStoreLink = Boolean(storeUrl);

    if (isCPA) {
      setLoadingItemId(item.id);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 3000)
      );

      try {
        const result = (await Promise.race([
          trackClickMutation.mutateAsync({
            partnerContentId: item.id,
          }),
          timeoutPromise,
        ])) as { clickId: string };

        const separator = url.includes("?") ? "&" : "?";
        url = `${url}${separator}clickId=${result.clickId}`;
      } catch (error) {
        console.error("Failed to track click:", error);
        toast.error("Connection slow. Opening link...");
      } finally {
        setLoadingItemId(null);
      }
    }

    if (isStoreLink) {
      Linking.openURL(url);
      return;
    }

    navigate("InAppBrowser", {
      url,
      title: item.title,
      // Only warn about losing points when points are actually on the line.
      confirmOnLeave: isCPA,
    });
  };

  const isLoading = (itemId: string) => loadingItemId === itemId;

  return { handleClick, isLoading };
}
