import type { PartnerContent } from "@news-spend-media/payload/types";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import { orpc } from "#/lib/orpc";

export type AdType = "custom" | "native";

type UsePartnerAdReturn = {
  ad: PartnerContent;
  isLoading: boolean;
  adType: AdType;
  refetchAd: () => void;
  cycleAdType: () => void;
};

function pickAdType(): AdType {
  return Math.random() < 0.4 ? "custom" : "native";
}

/**
 * Resolves which ad type to show and fetches partner content when needed.
 *
 * Ad type is re-randomized by calling `cycleAdType()` (e.g. after a close).
 * `refetchAd()` re-fetches the custom partner content (e.g. after dialog closes).
 *
 * Note: adType is "custom" or "native", but the caller must still check
 * whether the relevant content actually loaded before committing to show it.
 */
export function usePartnerAd(): UsePartnerAdReturn {
  const id = useId();
  const [adType, setAdType] = useState<AdType>(pickAdType);

  const queryOptions = orpc.partnerContent.getOne.queryOptions({
    input: { placement: ["connect-brands-tab"] },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const query = useQuery({
    ...queryOptions,
    queryKey: [...queryOptions.queryKey, id],
    // Only fetch when we actually need custom content
    enabled: adType === "custom",
  });

  const refetchAd = () => {
    query.refetch();
  };

  const cycleAdType = () => {
    setAdType(pickAdType());
  };

  return {
    ad: query.data,
    isLoading: query.isLoading,
    adType,
    refetchAd,
    cycleAdType,
  };
}
