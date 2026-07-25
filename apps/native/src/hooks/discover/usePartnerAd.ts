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

export function usePartnerAd(): UsePartnerAdReturn {
  const id = useId();
  const [adType, setAdType] = useState<AdType>(pickAdType);

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
