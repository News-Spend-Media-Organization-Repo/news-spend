import type { PartnerContent } from "@news-spend-media/payload/types";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Linking, Platform } from "react-native";
import { toast } from "sonner-native";

import { orpc } from "#/lib/orpc";

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

    let url = Platform.select({
      ios: item.links?.iosAppStore,
      android: item.links?.androidPlayStore,
    });
    if (!url) {
      url = item.links?.website;
    }

    if (!url) {
      return;
    }

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

    Linking.openURL(url);
  };

  const isLoading = (itemId: string) => loadingItemId === itemId;

  return { handleClick, isLoading };
}
