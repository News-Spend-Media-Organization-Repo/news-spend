import type { PartnerContent } from "@news-spend-media/payload/types";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import { orpc } from "#/lib/orpc";

export type AdType = "custom" | "native";

type UsePartnerAdReturn = {
  ad: PartnerContent | undefined;
  isLoading: boolean;
  adType: AdType;
  refetchAd: () => void;
  cycleAdType: () => void;
};

function pickAdType(): AdType {
  return Math.random() < 0.4 ? "custom" : "native";
}

type UsePartnerAdOptions = {
  /**
   * Pin the rotation to one kind of advertisement.
   *
   * For callers that need a predictable outcome rather than a fair share of
   * inventory — the giveaway reveal has to know whether an ad can be shown
   * before it decides how to sequence itself, and a Google ad it cannot
   * attribute or time is no use to it.
   */
  forceType?: AdType;
};

export function usePartnerAd({
  forceType,
}: UsePartnerAdOptions = {}): UsePartnerAdReturn {
  const id = useId();
  const [rotatingType, setRotatingType] = useState<AdType>(pickAdType);
  const adType = forceType ?? rotatingType;

  const queryOptions = orpc.partnerContent.getOne.queryOptions({
    input: { placement: ["connect-brands-tab", "connect-brand-video"] },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const query = useQuery({
    ...queryOptions,
    queryKey: [...queryOptions.queryKey, id],
  });

  const refetchAd = () => {
    query.refetch();
  };

  const cycleAdType = () => {
    // A pinned caller stays pinned — re-rolling here would quietly undo it on
    // the first close.
    if (forceType) {
      return;
    }
    setRotatingType(pickAdType());
  };

  return {
    ad: query.data,
    isLoading: query.isLoading,
    adType,
    refetchAd,
    cycleAdType,
  };
}
