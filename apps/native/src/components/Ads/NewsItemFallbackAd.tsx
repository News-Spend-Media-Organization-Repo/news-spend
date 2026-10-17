import { useQuery } from "@tanstack/react-query";
import { memo, useId } from "react";
import { orpc } from "#/lib/orpc";
import NewsItemAds from "./NewsItemAd";

/**
 * How long a fallback pick is kept before another is drawn.
 *
 * Long enough that scrolling back past the slot does not swap the creative,
 * short enough that a campaign ending is noticed within a session.
 */
const FALLBACK_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * A partner ad shown where Google had nothing to serve.
 *
 * Google answering "No ad to show" is ordinary no-fill, and for a large share
 * of our readers it is the usual answer. A collapsed slot earns nothing and
 * leaves a hole in the feed, so the slot is given to a partner ad instead,
 * using the same row and click tracking as the feed's own partner ads. Keyed
 * per slot so neighbouring fallbacks draw independent picks, the way
 * CustomBannerAd does.
 */
const NewsItemFallbackAd = memo(function NewsItemFallbackAd({
  slotId,
}: {
  slotId: string;
}) {
  const instanceId = useId();
  const queryOptions = orpc.partnerContent.getOne.queryOptions({
    input: { placement: ["homepage-ads-banner"] },
    staleTime: FALLBACK_STALE_TIME_MS,
  });
  const { data } = useQuery({
    ...queryOptions,
    queryKey: [...queryOptions.queryKey, slotId, instanceId],
    refetchOnWindowFocus: false,
  });

  if (!data) {
    return null;
  }

  return (
    <NewsItemAds
      fromFallback
      item={{ _type: "ad", id: `fallback-${slotId}`, payload: data }}
    />
  );
});

export default NewsItemFallbackAd;
